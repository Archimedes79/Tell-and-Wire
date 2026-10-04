import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AiService, Runtime } from '../../graph/nodes/Runtime.ts';
import { mcpToolService } from '../../graph/ai/mcp.ts';
import { createGraphTools, serveStdio, type GraphTools, type Problem } from './mcpServer.ts';

const MAIN = resolve(__dirname, '..', 'app', 'main.ts');

// ---------------------------------------------------------------------------
// Graphs small enough to read
// ---------------------------------------------------------------------------

const port = (id: string, kind: 'input' | 'output') =>
  ({ id, name: id, kind, data_type: 'any', multi: false, required: false, description: '' });

/** A data node holding a text: what a graph starts from when nobody sends it anything. */
const textData = (id: string, value = 'hello') => ({
  id, node_type: 'data', label: id, description: 'A greeting to hand on.', position: { x: 0, y: 0 },
  inputs: [], outputs: [port('output', 'output')], config: { data_value: value },
});

const code = (id: string, body = 'function run(inputs) { return { out: inputs.in }; }') => ({
  id, node_type: 'code', label: id, description: 'Hands on what it is given.', position: { x: 0, y: 0 },
  inputs: [port('in', 'input')], outputs: [port('out', 'output')], config: { code: body } as Record<string, unknown>,
});

/** An end point as a new one starts: called "Result", which names its value in the run's result. */
const output = (id: string) => ({
  id, node_type: 'end', label: 'Result', description: '', position: { x: 0, y: 0 },
  inputs: [port('value', 'input')], outputs: [], config: {},
});

const edge = (id: string, from: string, to: string) => {
  const [source_node_id, source_port_id] = from.split('.');
  const [target_node_id, target_port_id] = to.split('.');
  return { id, source_node_id, source_port_id, target_node_id, target_port_id };
};

const graphOf = (nodes: unknown[], edges: unknown[] = [], name = 'Test') =>
  ({ metadata: { name, description: `${name}, described` }, nodes, edges });

/** The smallest graph with nothing wrong with it. */
const hello = (value = 'hello') =>
  graphOf([textData('greeting', value), output('result')], [edge('e1', 'greeting.output', 'result.value')], 'Hello');

// ---------------------------------------------------------------------------
// A machine made of fakes
// ---------------------------------------------------------------------------

const replying = (reply: string | Error): AiService => ({
  async complete() {
    if (reply instanceof Error) throw reply;
    return reply;
  },
});

const fenced = (graph: unknown, explanation = 'It greets.'): string =>
  `\`\`\`json\n${JSON.stringify(graph, null, 2)}\n\`\`\`\n${explanation}`;

/** What the code runner was last handed, so a test can see which body ran. */
let ranBody = '';

const fakeRuntime = (): Runtime => ({
  files: {
    resolve: (path) => path,
    exists: async () => false,
    read: async () => { throw new Error('no files in this test'); },
    write: async () => { throw new Error('no files in this test'); },
    list: async () => [],
  },
  code: {
    async run(body, inputs) {
      ranBody = body;
      return { out: `ran on ${String(inputs.in)}` };
    },
  },
  ai: replying('unused'),
});

let root: string;
let outside: string;

const toolsWith = (overrides: Partial<Parameters<typeof createGraphTools>[0]> = {}): GraphTools => createGraphTools({
  root,
  ai: replying(fenced(hello())),
  runtime: fakeRuntime,
  target: async () => ({ provider: 'fake', model: 'fake-1' }),
  ...overrides,
});

const answer = async (tools: GraphTools, name: string, args: Record<string, unknown> = {}) => {
  const result = await tools.call(name, args);
  let parsed: any;
  try { parsed = JSON.parse(result.text); } catch { parsed = undefined; }
  return { ...result, json: parsed };
};

const problemsOf = async (graph: unknown): Promise<Problem[]> =>
  (await answer(toolsWith(), 'validate_graph', { graph: graph as Record<string, unknown> })).json.problems;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'tell-and-wire-mcp-'));
  outside = await mkdtemp(join(tmpdir(), 'tell-and-wire-mcp-outside-'));
  ranBody = '';
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// The tools
// ---------------------------------------------------------------------------

describe('generate_graph', () => {
  it('generates, validates, saves, and the saved file is a graph the other tools can read', async () => {
    const tools = toolsWith();
    const made = await answer(tools, 'generate_graph', { description: 'greet the world', save_as: 'made/hello.json' });
    expect(made.isError).toBeUndefined();
    expect(made.json.saved).toBe('made/hello.json');
    expect(made.json.problems).toEqual([]);
    expect(made.json.explanation).toBe('It greets.');

    const onDisk = JSON.parse(await readFile(join(root, 'made', 'hello.json'), 'utf8'));
    expect(onDisk.metadata.name).toBe('Hello');
    expect((await answer(tools, 'validate_graph', { path: 'made/hello.json' })).json).toEqual({ valid: true, problems: [] });
    expect((await answer(tools, 'list_graphs')).json.graphs).toEqual([
      { path: 'made/hello.json', name: 'Hello', description: 'Hello, described', nodes: 2 },
    ]);
  });

  it("passes a provider's error through, and never a key with it", async () => {
    const failing = new Error('401 from api.example: invalid key hunter2-hunter2-hunter2, also sk-abcdefghijklmnopqrstuvwxyz012345');
    const made = await toolsWith({ ai: replying(failing), secrets: () => ['hunter2-hunter2-hunter2'] })
      .call('generate_graph', { description: 'x' });
    expect(made.isError).toBe(true);
    expect(made.text).toContain('401 from api.example');
    expect(made.text).not.toContain('hunter2');
    expect(made.text).not.toContain('sk-abcdefghij');
  });
});

describe('validate_graph', () => {
  it('finds nothing wrong with a good graph, names what is wrong with a broken one, and does not call a non-graph a failure', async () => {
    expect(await problemsOf(hello())).toEqual([]);

    const problems = await problemsOf(graphOf([textData('greeting'), output('result')], [edge('e1', 'ghost.output', 'result.value')]));
    expect(problems).toHaveLength(1);
    expect(problems[0].where).toBe('edge "e1"');
    expect(problems[0].problem).toMatch(/source is node "ghost"/);
    expect(problems[0].fix).toMatch(/"greeting", "result"/);

    const notGraph = await answer(toolsWith(), 'validate_graph', { graph: { name: 'not-a-graph' } });
    expect(notGraph.isError).toBeUndefined();
    expect(notGraph.json.valid).toBe(false);
  });
});

describe('save_graph', () => {
  it('writes only what is safe: never a graph with problems, never over a file that is not a graph', async () => {
    const bad = await answer(toolsWith(), 'save_graph', { path: 'bad.json', graph: graphOf([code('alone')]) });
    expect(bad.isError).toBe(true);
    expect(bad.json.saved).toBe(false);
    expect(existsSync(join(root, 'bad.json'))).toBe(false);

    // `save_graph` is not "write any JSON file".
    const manifest = '{ "name": "somebody-elses-project", "version": "1.0.0" }\n';
    await writeFile(join(root, 'package.json'), manifest);
    await writeFile(join(root, 'notes.json'), 'not even json');
    for (const path of ['package.json', 'notes.json']) {
      const saved = await toolsWith().call('save_graph', { path, graph: hello() });
      expect(saved.isError).toBe(true);
      expect(saved.text).toMatch(/already exists and is not a graph/);
    }
    expect(await readFile(join(root, 'package.json'), 'utf8')).toBe(manifest);
    expect(await readFile(join(root, 'notes.json'), 'utf8')).toBe('not even json');
  });

  it('saves into a project the way the editor does, and run_graph reads it back by the project\'s own files', async () => {
    const saved = await toolsWith().call('save_graph', {
      path: 'proj/flow.json', graph: graphOf([textData('greeting'), code('work'), output('result')],
        [edge('e1', 'greeting.output', 'work.in'), edge('e2', 'work.out', 'result.value')]),
    });
    expect(saved.isError).toBeUndefined();
    expect(await readFile(join(root, 'proj', 'nodes', 'work', 'code.js'), 'utf8')).toContain('function run');
    const flow = JSON.parse(await readFile(join(root, 'proj', 'flow.json'), 'utf8'));
    expect(flow.wires).toEqual(['greeting.output -> work.in', 'work.out -> result.value']);
    expect(JSON.parse(await readFile(join(root, 'proj', 'nodes', 'work', 'node.json'), 'utf8')).config).not.toHaveProperty('code');

    const ran = await answer(toolsWith(), 'run_graph', { path: 'proj/flow.json' });
    expect(ran.json.status).toBe('success');
    expect(ranBody).toContain('function run');
  });
});

describe('confinement', () => {
  const refused = async (tools: GraphTools, path: string, pattern: RegExp): Promise<void> => {
    for (const [name, args] of [
      ['validate_graph', { path }],
      ['run_graph', { path }],
      ['save_graph', { path, graph: hello() }],
      ['generate_graph', { description: 'x', save_as: path }],
    ] as const) {
      const result = await tools.call(name, args);
      expect(result.isError, `${name} ${path}`).toBe(true);
      expect(result.text, `${name} ${path}`).toMatch(pattern);
    }
  };

  it('refuses every way out of the root', async () => {
    const tools = toolsWith();
    await writeFile(join(outside, 'secret.json'), JSON.stringify(hello('a secret')));

    await refused(tools, '../escape.json', /outside the folder/);
    await refused(tools, 'graphs/../../escape.json', /outside the folder/);
    await refused(tools, join(outside, 'secret.json'), /outside the folder/);
    // The sibling whose name merely starts with the root's.
    await refused(tools, `${root}-old/x.json`, /outside the folder/);
    if (process.platform === 'win32') {
      await refused(tools, 'Z:\\elsewhere\\x.json', /outside the folder/);
      await refused(tools, '\\\\server\\share\\x.json', /outside the folder/);
      await refused(tools, 'notes.exe:x.json', /cannot be trusted/);
    }
    expect(existsSync(join(outside, 'escape.json'))).toBe(false);
    expect(existsSync(resolve(root, '..', 'escape.json'))).toBe(false);
  });

  it('follows a link before trusting it: a folder linked out of the root, and a project folder linked out of it', async () => {
    const kind = process.platform === 'win32' ? 'junction' : 'dir';  // the one link that needs no privilege on Windows
    await writeFile(join(outside, 'secret.json'), JSON.stringify(hello('a secret')));
    await symlink(outside, join(root, 'link'), kind);

    const tools = toolsWith();
    await refused(tools, 'link/secret.json', /outside the folder/);
    await refused(tools, 'link/new.json', /outside the folder/);
    expect(existsSync(join(outside, 'new.json'))).toBe(false);
    expect((await answer(tools, 'list_graphs')).json.graphs).toEqual([]);

    await writeFile(join(outside, 'code.js'), 'function run() { return { out: "from outside" }; }');
    await mkdir(join(root, 'proj', 'nodes'), { recursive: true });
    await writeFile(join(root, 'proj', 'flow.json'), JSON.stringify({ nodes: { work: 'code', result: 'end' }, wires: ['work.out -> result.value'] }));
    await symlink(outside, join(root, 'proj', 'nodes', 'work'), kind);
    const ran = await tools.call('run_graph', { path: 'proj/flow.json' });
    expect(ran.isError).toBe(true);
    expect(ran.text).toMatch(/outside the folder/);
    expect(ranBody).toBe('');
  });

  it('reads and writes .json and nothing else, and stays out of dot-folders, node_modules and dist', async () => {
    const tools = toolsWith();
    await refused(tools, 'code.js', /not a \.json file/);
    await refused(tools, 'graph.json.', /not a \.json file/);
    await refused(tools, '.git/x.json', /dot-folder/);
    await refused(tools, 'node_modules/pkg/package.json', /dot-folder/);
    await refused(tools, 'dist/x.json', /dot-folder/);
  });

  it('never opens the settings file, even when it would pass for a graph', async () => {
    // Shaped like a graph on purpose: the name is what keeps it shut, not the content.
    const settings = JSON.stringify({ api_keys: { openai: 'sk-live-THIS-MUST-NOT-LEAK-0123456789' }, nodes: [], edges: [] });
    await writeFile(join(root, 'ai-settings.json'), settings);
    await mkdir(join(root, 'sub'));
    await writeFile(join(root, 'sub', 'AI-Settings.json'), settings);

    const tools = toolsWith();
    await refused(tools, 'ai-settings.json', /settings file/);
    await refused(tools, 'sub/AI-Settings.json', /settings file/);
    const listed = await tools.call('list_graphs', {});
    expect(listed.text).not.toContain('settings');
    expect(listed.text).not.toContain('MUST-NOT-LEAK');
    expect(await readFile(join(root, 'ai-settings.json'), 'utf8')).toBe(settings);
  });

  it('blanks a configured secret wherever it turns up, a run included', async () => {
    await writeFile(join(root, 'leak.json'), JSON.stringify(hello('the key is hunter2-hunter2-hunter2, apparently')));
    const ran = await toolsWith({ secrets: () => ['hunter2-hunter2-hunter2'] }).call('run_graph', { path: 'leak.json' });
    expect(ran.text).toContain('the key is [redacted], apparently');
    expect(ran.text).not.toContain('hunter2');
  });
});

describe('call', () => {
  it('never throws: an unknown tool and nonsense arguments are both answers, and the nine tools are the ones listed', async () => {
    const tools = toolsWith();
    const unknown = await tools.call('format_disk', {});
    expect(unknown.isError).toBe(true);

    for (const args of [null, 'text', [1, 2], { path: 42 }, { path: { toString: null } }]) {
      const result = await tools.call('run_graph', args as never);
      expect(result.isError).toBe(true);
    }
    expect(tools.specs.map((spec) => spec.name)).toEqual(
      ['authoring_guide', 'generate_graph', 'validate_graph', 'save_graph', 'run_graph', 'describe_graph', 'run_node', 'test_graph', 'list_graphs']);
  });
});

// ---------------------------------------------------------------------------
// The transport
// ---------------------------------------------------------------------------

describe('serveStdio', () => {
  /** Feed lines in, close the input, and hand back every line that came out. */
  const exchange = async (tools: GraphTools, lines: string[]): Promise<{ answers: any[] }> => {
    const input = new PassThrough();
    const out = new PassThrough();
    const log = new PassThrough();
    let written = '';
    out.on('data', (chunk) => { written += String(chunk); });

    const served = serveStdio(tools, { input, output: out, log });
    for (const line of lines) input.write(`${line}\n`);
    input.end();
    await served;
    return { answers: written.split('\n').filter(Boolean).map((line) => JSON.parse(line)) };
  };

  const rpc = (id: number | undefined, method: string, params?: unknown): string =>
    JSON.stringify({ jsonrpc: '2.0', ...(id === undefined ? {} : { id }), method, ...(params === undefined ? {} : { params }) });

  it('shakes hands, lists nine tools, answers a ping, and says nothing to a notification', async () => {
    const { answers } = await exchange(toolsWith(), [
      rpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } }),
      rpc(undefined, 'notifications/initialized'),
      rpc(2, 'ping'),
      rpc(3, 'tools/list', {}),
    ]);
    expect(answers).toHaveLength(3);
    const byId = new Map(answers.map((answer) => [answer.id, answer]));
    expect(byId.get(1).result).toMatchObject({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'tell-and-wire' } });
    expect(byId.get(2).result).toEqual({});
    expect(byId.get(3).result.tools).toHaveLength(9);
  });

  it('survives everything a client can get wrong, and answers the next line', async () => {
    const { answers } = await exchange(toolsWith(), [
      'this is not json',
      '[1, 2, 3]',
      '42',
      rpc(7, 'resources/list'),
      rpc(8, 'tools/call', { name: 'format_disk', arguments: {} }),
      rpc(9, 'tools/call', { name: 'run_graph', arguments: { path: '../../etc/passwd.json' } }),
      rpc(10, 'tools/call', { name: 'validate_graph' }),
      JSON.stringify({ jsonrpc: '2.0', id: 11 }),
      JSON.stringify({ jsonrpc: '2.0', id: 99, result: {} }),
      rpc(12, 'ping'),
    ]);
    const errors = answers.filter((answer) => answer.id === null).map((answer) => answer.error.code);
    expect(errors).toEqual([-32700, -32600, -32600]);

    const byId = new Map(answers.map((answer) => [answer.id, answer]));
    expect(byId.get(7).error.code).toBe(-32601);
    expect(byId.get(8).error.code).toBe(-32602);
    // A tool that refuses is a result the model gets to read, not a protocol error.
    expect(byId.get(9).error).toBeUndefined();
    expect(byId.get(9).result.isError).toBe(true);
    expect(byId.get(9).result.content[0].text).toMatch(/outside the folder/);
    expect(byId.get(10).result.isError).toBe(true);
    expect(byId.get(11).error.code).toBe(-32600);
    // A response to nothing we asked is not answered.
    expect(byId.has(99)).toBe(false);
    // And after all of that, it is still here.
    expect(byId.get(12).result).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// The whole thing, as a client meets it
// ---------------------------------------------------------------------------

describe('node main.ts --mcp', () => {
  it("serves the repo's own MCP client, end to end", async () => {
    // No settings file of this machine's, whatever is lying around: nothing here calls a model.
    const env = { TW_SETTINGS: join(tmpdir(), 'tell-and-wire-mcp-no-such-settings.json') };
    const service = mcpToolService(
      { 'tell-and-wire': { command: process.execPath, args: [MAIN, '--mcp', '--mcp-root', root], env } },
      { handshakeTimeoutMs: 30_000, callTimeoutMs: 30_000 },
    );
    const session = await service.open(['tell-and-wire']);
    try {
      expect(session.specs).toHaveLength(9);

      expect(JSON.parse(await session.call('validate_graph', { graph: hello() }))).toEqual({ valid: true, problems: [] });
      expect(JSON.parse(await session.call('validate_graph', { graph: graphOf([code('alone', '')]) })).valid).toBe(false);

      // Saved through the protocol, run through the protocol, in the folder it was given.
      expect(JSON.parse(await session.call('save_graph', { path: 'hello.json', graph: hello('over the wire') })).saved).toBe('hello.json');
      expect(existsSync(join(root, 'hello.json'))).toBe(true);
      const ran = JSON.parse(await session.call('run_graph', { path: 'hello.json' }));
      expect(ran.status).toBe('success');
      expect(ran.outputs.result).toBe('over the wire');

      expect(await session.call('run_graph', { path: '../hello.json' })).toMatch(/^Tool error: .*outside the folder/);
    } finally {
      await session.close();
    }
  }, 60_000);
});
