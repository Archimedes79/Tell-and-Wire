import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { parseGraph } from '../../graph/graph.ts';
import { writeProject } from '../authoring/write.ts';
import { main, parseArgs } from './cli.ts';
import { appWindowCommands } from './appWindow.ts';

describe('parseArgs', () => {
  it('takes the graph, repeats --value into values by name (a dotted name inside another), takes an --event, and refuses a flag it does not know', () => {
    const options = parseArgs(['g.json', '--value', 'a=1', '--value', 'file.content=a,b', '--value', 'file.path=a.csv', '--value', 'q=x=y', '--event', 'go']);
    expect(options.graphPath).toBe('g.json');
    expect(options.values).toEqual({ a: '1', file: { content: 'a,b', path: 'a.csv' }, q: 'x=y' });
    expect(options.event).toBe('go');
    // Not this command's: a parameter of the tool, if its start point declares one -- else said once the tool is read.
    expect(parseArgs(['g.json', '--ai-force', '--words=3', '--text', 'hi', '--loud']).flags).toEqual({ 'ai-force': true, words: '3', text: 'hi', loud: true });
    // A name is a key of the values, not a way into the prototype every object shares.
    parseArgs(['g.json', '--value', '__proto__.polluted=1', '--value', 'constructor.prototype.polluted=1']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('does not take the next option for the value of --editor, --host, --bundle or --mcp-root', () => {
    const options = parseArgs(['--editor', '--port', '9000']);
    expect(options.port).toBe(9000);
    expect(isAbsolute(options.editor!)).toBe(true);
    expect(parseArgs(['g', '--bundle', '--keep'])).toMatchObject({ bundle: 'bundle', keep: true });
    expect(() => parseArgs(['--host', '--port', '9000'])).toThrow(/--host wants/);
    expect(() => parseArgs(['--mcp', '--mcp-root'])).toThrow(/--mcp-root wants/);
  });
});

const port = (id: string, kind: 'input' | 'output', dataType = 'any') =>
  ({ id, name: id, kind, data_type: dataType, multi: false, required: false, description: '' });

/** What a command prints: stdout, which is the result, and stderr, which is everything said about it. */
async function printed(argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const writes: string[] = [];
  const said: string[] = [];
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => { writes.push(String(chunk)); return true; });
  const stderr = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => { said.push(String(chunk)); return true; });
  try {
    return { code: await main(argv), out: writes.join(''), err: said.join('') };
  } finally {
    stdout.mockRestore();
    stderr.mockRestore();
  }
}

describe('--host', () => {
  it('does not offer the editor beyond this machine unless told that nobody else can reach its port', async () => {
    await expect(printed(['--editor', 'frontend/dist', '--host', '0.0.0.0'])).rejects.toThrow(/TW_EDITOR_ON_NETWORK/);
    // Only the 1 the documents name opens it: "0" or "false" in the variable is not a yes.
    vi.stubEnv('TW_EDITOR_ON_NETWORK', '0');
    try {
      await expect(printed(['--editor', 'frontend/dist', '--host', '0.0.0.0'])).rejects.toThrow(/TW_EDITOR_ON_NETWORK/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

/**
 * One node by itself, from a command line: what its panel tries, with no
 * editor anywhere -- the node's example, and the files its example reads.
 */
describe('run-node', () => {
  it('runs a node once on the example in its input.js -- a file\'s text, already read -- and holds it to its output.js', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tell-and-wire-run-node-'));
    await writeProject(dir, parseGraph({
      metadata: { name: 'Rows' },
      nodes: [{
        id: 'count', node_type: 'code', label: 'Count', inputs: [port('csv', 'input', 'file_path')], outputs: [port('rows', 'output')],
        config: {
          code: 'function run(i) { return { rows: i.csv.trim().split("\\n").length - 1 }; }',
          input_definition: '/** @typedef {Object} Input @property {string} csv a CSV\'s text */\nmodule.exports = { "csv": "name\\nAda\\nBo" };\n',
          output_definition: '/** @typedef {Object} Output @property {number} rows how many rows */\nmodule.exports = { "rows": 2 };\n',
        },
      }],
      edges: [],
    }));
    try {
      const { code, out } = await printed(['run-node', dir, 'count']);
      expect(code).toBe(0);
      expect(JSON.parse(out)).toMatchObject({ status: 'pass', outputs: { rows: 2 }, held: true });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);
});

describe('showing a tool as a program', () => {
  const none = () => false;
  it('opens Edge, then Chrome, as a window of its own where they are, and names no browser where none is', () => {
    // Folders without separators of their own: the path is joined as the system running the test joins it.
    const env = { 'ProgramFiles(x86)': 'pf86', ProgramFiles: 'pf', LOCALAPPDATA: 'local' };
    const there = (path: string) => (path.endsWith('msedge.exe') && path.includes('pf86')) || (path.endsWith('chrome.exe') && path.includes('local'));
    const windows = appWindowCommands('http://127.0.0.1:8000', 'win32', env, there);
    expect(windows.map((one) => /(msedge|chrome)\.exe$/.exec(one.command)?.[1])).toEqual(['msedge', 'chrome']);
    expect(windows[0].args).toEqual(['--app=http://127.0.0.1:8000']);
    expect(appWindowCommands('http://x', 'win32', env, none)).toEqual([]);
    expect(appWindowCommands('http://x', 'darwin', {}, (path) => path === '/Applications/Google Chrome.app')).toEqual([
      { command: 'open', args: ['-na', 'Google Chrome', '--args', '--app=http://x'] },
    ]);
    expect(appWindowCommands('http://x', 'linux', {}, none).map((one) => one.command)).toContain('chromium');
  });
});

/** A tool whose start point declares what the command line takes, a code node that reads it, and an end point. */
async function shoutProject(declare: boolean): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'tell-and-wire-cli-'));
  await writeProject(dir, parseGraph({
    metadata: { name: 'Shout', description: 'Says it louder.' },
    nodes: [
      {
        id: 'say', node_type: 'start', label: 'Say', description: 'Say something.', inputs: [], outputs: [],
        config: {
          started_by: 'call',
          ...(declare ? { params: [
            { name: 'text', type: 'text', required: true, description: 'What to say.' },
            { name: 'words', type: 'number', default: '3' },
            { name: 'loud', type: 'flag' },
          ] } : {}),
        },
      },
      {
        id: 'shout', node_type: 'code', label: 'Shout', inputs: [port('request', 'input')], outputs: [port('output', 'output')],
        config: { code: 'function run(i) { const v = i.request.values; const t = String(v.text).split(" ").slice(0, v.words ?? 99).join(" "); return { output: v.loud ? t.toUpperCase() : t }; }' },
      },
      { id: 'told', node_type: 'end', label: 'Told', inputs: [port('value', 'input')], outputs: [], config: {} },
    ],
    edges: [
      { id: 'e1', source_node_id: 'say', source_port_id: 'data', target_node_id: 'shout', target_port_id: 'request' },
      { id: 'e2', source_node_id: 'shout', source_port_id: 'output', target_node_id: 'told', target_port_id: 'value' },
    ],
  }));
  return dir;
}

describe("a start point's command line", () => {
  const told = (out: string) => (JSON.parse(out).node_results as { node_id: string; inputs: Record<string, unknown> }[]).find((one) => one.node_id === 'told')!.inputs.value;

  it('is typed after the tool: --name value, --name=value, a flag alone -- typed, with defaults, and it runs that start point with no --event', async () => {
    const dir = await shoutProject(true);
    try {
      const first = await printed([dir, '--text', 'one two three four', '--words=2', '--loud']);
      expect(first.code).toBe(0);
      expect(told(first.out)).toBe('ONE TWO');
      // The defaults: three words, not loud.
      expect(told((await printed([dir, '--text', 'a b c d e'])).out)).toBe('a b c');
      // What --value says still wins: it names exactly what it means.
      expect(told((await printed([dir, '--text', 'a b', '--value', 'text=x y'])).out)).toBe('x y');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it('is refused in a sentence before anything runs: a parameter missing, one that is none, one of the wrong kind', async () => {
    const dir = await shoutProject(true);
    try {
      await expect(printed([dir])).rejects.toThrow(/Missing --text: it is required/);
      await expect(printed([dir, '--text', 'hi', '--nope', '1'])).rejects.toThrow(/Unknown option "--nope". This tool takes --text, --words, --loud/);
      await expect(printed([dir, '--text', 'hi', '--words', 'many'])).rejects.toThrow(/--words wants a number/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);

  it('is said by --help, which runs nothing; and a tool that declares none takes none', async () => {
    const declared = await shoutProject(true);
    const bare = await shoutProject(false);
    try {
      const help = await printed([declared, '--help']);
      expect(help.code).toBe(0);
      expect(help.out).toContain('Shout');
      expect(help.out).toContain('--text <text>');
      expect(help.out).toContain('What to say. (required)');
      expect(help.out).not.toContain('node_results');
      await expect(printed([bare, '--text', 'hi'])).rejects.toThrow(/Unknown option "--text".*declares no parameters/);
      // Without parameters, a run is what it was: the whole graph, once.
      expect((await printed([bare])).code).toBe(0);
    } finally {
      await rm(declared, { recursive: true, force: true });
      await rm(bare, { recursive: true, force: true });
    }
  }, 30_000);
});
