import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

describe('--host', () => {
  it('does not offer the editor beyond this machine unless told that nobody else can reach its port', async () => {
    await expect(printed(['--editor', 'frontend/dist', '--host', '0.0.0.0'])).rejects.toThrow(/TW_EDITOR_ON_NETWORK/);
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
