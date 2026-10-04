import { describe, it, expect, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseGraph } from '../../../graph/graph.ts';
import { writeProject } from '../project/folder.ts';
import { main, parseArgs } from './cli.ts';

describe('parseArgs', () => {
  it('takes the graph, repeats --value into values by name (a dotted name inside another), takes an --event, and refuses a flag it does not know', () => {
    const options = parseArgs(['g.json', '--value', 'a=1', '--value', 'file.content=a,b', '--value', 'file.path=a.csv', '--value', 'q=x=y', '--event', 'go']);
    expect(options.graphPath).toBe('g.json');
    expect(options.values).toEqual({ a: '1', file: { content: 'a,b', path: 'a.csv' }, q: 'x=y' });
    expect(options.event).toBe('go');
    expect(() => parseArgs(['g.json', '--ai-force'])).toThrow(/Unknown option "--ai-force"/);
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

describe('a round kept as a test', () => {
  it('keeps a round that ran through as a test of the project, which test runs again -- and fails once the graph hands back otherwise', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tell-and-wire-kept-'));
    const asking = (code: string) => parseGraph({
      metadata: { name: 'Ask' },
      nodes: [
        { id: 'ask', node_type: 'start', label: 'Ask', outputs: [port('data', 'output')], config: { started_by: 'call' } },
        { id: 'say', node_type: 'code', label: 'Say', description: 'Says the question back.', inputs: [{ ...port('question', 'input'), field: 'question' }], outputs: [port('out', 'output')], config: { code } },
        { id: 'said', node_type: 'end', label: 'Said', inputs: [port('value', 'input')], outputs: [], config: {} },
      ],
      edges: [
        { id: 'a', source_node_id: 'ask', source_port_id: 'data', target_node_id: 'say', target_port_id: 'question' },
        { id: 'b', source_node_id: 'say', source_port_id: 'out', target_node_id: 'said', target_port_id: 'value' },
      ],
    });
    await writeProject(dir, asking('function run(i) { return { out: "you asked: " + i.question }; }'));
    try {
      const kept = await printed([dir, '--event', 'ask', '--value', 'question=why', '--keep']);
      expect(kept.err).toContain('Kept as tests/ask-1.json -- the test command runs it again, asking no model.');
      expect(JSON.parse(await readFile(join(dir, 'tests', 'ask-1.json'), 'utf8')).outputs).toEqual({ said: 'you asked: why' });
      expect((await printed(['test', dir])).out).toContain('✓ ' + dir + ' tests/ask-1: hands back what it did');
      await writeProject(dir, asking('function run(i) { return { out: "asked: " + i.question }; }'));
      const failed = await printed(['test', dir]);
      expect(failed.code).toBe(1);
      expect(failed.out).toContain('✗ ' + dir + ' tests/ask-1: hands back otherwise');
      expect(failed.out).toContain('"said" handed back "asked: why"; the kept round, "you asked: why".');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
});

describe('--every', () => {
  it('runs one graph round after round: what a round leaves in a data node is what the next starts from', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tell-and-wire-every-'));
    await writeProject(dir, parseGraph({
      metadata: { name: 'Counter' },
      nodes: [
        {
          id: 'count', node_type: 'data', label: 'Count', inputs: [port('input', 'input')], outputs: [port('output', 'output')],
          config: { data_format: 'structure', data_value: 0 },
        },
        {
          id: 'add', node_type: 'code', label: 'Add one', inputs: [port('n', 'input')], outputs: [port('next', 'output')],
          config: { code: 'function run(i) { return { next: i.n + 1 }; }' },
        },
      ],
      edges: [
        { id: 'a', source_node_id: 'count', source_port_id: 'output', target_node_id: 'add', target_port_id: 'n' },
        { id: 'b', source_node_id: 'add', source_port_id: 'next', target_node_id: 'count', target_port_id: 'input' },
      ],
    }));
    try {
      const { code, out } = await printed([dir, '--every', '0.01', '--limit', '3']);
      expect(code).toBe(0);
      const rounds = out.trim().split(/\n(?=\{)/).map((round) => JSON.parse(round) as { node_results: { node_id: string; outputs: { next?: number } }[] });
      expect(rounds.map((round) => round.node_results.find((result) => result.node_id === 'add')?.outputs.next)).toEqual([1, 2, 3]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
});

const freePort = () => new Promise<number>((found) => {
  const probe = createServer();
  probe.listen(0, '127.0.0.1', () => {
    const { port: taken } = probe.address() as { port: number };
    probe.close(() => found(taken));
  });
});

const MINIMAL = resolve(__dirname, '..', '..', '..', 'graph', 'test', 'fixtures', 'minimal.json');

/** A server started as a person or a launcher starts one: its own process, told nothing opens a browser. */
function started(args: string[], cwd: string) {
  const child = spawn(process.execPath, [resolve(__dirname, '..', 'main.ts'), ...args], {
    // Its own settings file, none: what a server says at start must not come from this machine's.
    env: { ...process.env, TW_NO_BROWSER: '1', TW_SETTINGS: join(tmpdir(), 'tell-and-wire-no-settings.json') }, cwd, stdio: ['ignore', 'ignore', 'pipe'],
  });
  let said = '';
  child.stderr.on('data', (chunk: Buffer) => { said += chunk.toString(); });
  const ended = new Promise((done) => child.on('exit', done));
  return {
    /** Until it serves, or ends, or ten seconds have gone by. */
    async up(): Promise<void> {
      for (const until = Date.now() + 10_000; Date.now() < until && !said.includes('Serving on') && child.exitCode === null;) {
        await new Promise((wake) => setTimeout(wake, 100));
      }
    },
    async stop(): Promise<void> {
      child.kill();
      await ended;
    },
  };
}

describe('--editor, as it is started', () => {
  it('serves no graph.json it was started beside -- only one it is given', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tell-and-wire-editor-'));
    await writeFile(join(dir, 'graph.json'), await readFile(MINIMAL, 'utf8'));
    try {
      const alone = await freePort();
      const beside = started(['--editor', dir, '--port', String(alone)], dir);
      try {
        await beside.up();
        expect((await fetch(`http://127.0.0.1:${alone}/api/runtime/interface`)).status).toBe(404);
      } finally {
        await beside.stop();
      }
      const other = await freePort();
      const given = started(['graph.json', '--editor', dir, '--port', String(other)], dir);
      try {
        await given.up();
        expect((await fetch(`http://127.0.0.1:${other}/api/runtime/interface`)).status).toBe(200);
      } finally {
        await given.stop();
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
