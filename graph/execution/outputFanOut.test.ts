import { describe, it, expect } from 'vitest';
import type { Graph, GraphNode, Port } from '../graph.ts';
import { executeGraph } from './executor.ts';
import { registry } from '../nodes/registry.ts';
import { edge, graphOf, quietRuntime } from '../test/fakes.ts';

/**
 * An end point takes what arrives whole, whatever its batch_mode says.
 *
 * Fanned out, one writing to a file wrote each item over the same file, the
 * last one winning, and one writing to a folder wrote `value.txt` once per
 * item instead of `value_1..3`. Only code and ai run once per item
 * (`NodeRunner.fansOut`).
 */

const list = (id: string): Port => ({ id, name: id, kind: 'output', data_type: 'any', multi: true, required: false, description: '' });
const into = (id: string, multi: boolean): Port => ({ id, name: id, kind: 'input', data_type: 'any', multi, required: false, description: '' });

/** A data node holding *value*, wired into an end point told to run once per item. */
function graph(value: unknown, output: Record<string, unknown>): Graph {
  const nodes: GraphNode[] = [
    {
      id: 'items', node_type: 'data', label: 'Items', description: '', position: { x: 0, y: 0 },
      inputs: [], outputs: [list('output')], config: { data_value: value, data_format: 'structure' },
    },
    {
      id: 'out', node_type: 'end', label: 'Out', description: '', position: { x: 0, y: 0 },
      inputs: [into('value', true), into('path', false)], outputs: [],
      config: { batch_mode: 'per_item', ...output },
    },
  ];
  return graphOf(nodes, [edge('e1', 'items', 'output', 'out', 'value')]);
}

/** A runtime whose files are a list of writes, in order. */
function recording() {
  const writes: Array<[string, string]> = [];
  const runtime = quietRuntime({ files: { write: async (path, content) => { writes.push([path, content]); } } });
  return { runtime, writes };
}

async function run(g: Graph) {
  const { runtime, writes } = recording();
  const result = await executeGraph(g, { runtime, registry });
  return { writes, out: result.node_results.find((entry) => entry.node_id === 'out')?.outputs ?? {} };
}

describe('an end point told to run "once per item"', () => {
  it('still takes a list whole: written once to its file, as numbered files to its folder', async () => {
    const toFile = await run(graph(['a', 'b', 'c'], { write_mode: 'file', path: '/tmp/r.txt' }));
    expect(toFile.writes).toEqual([['/tmp/r.txt', JSON.stringify(['a', 'b', 'c'])]]);
    expect(toFile.out.written_path).toBe('/tmp/r.txt');

    const toFolder = await run(graph(['a', 'b', 'c'], { write_mode: 'directory', path: '/tmp/d' }));
    expect(toFolder.writes.map(([path]) => path)).toEqual(['/tmp/d/value_1.txt', '/tmp/d/value_2.txt', '/tmp/d/value_3.txt']);
  });
});
