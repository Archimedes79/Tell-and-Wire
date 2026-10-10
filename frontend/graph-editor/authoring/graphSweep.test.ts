import { describe, it, expect } from 'vitest';
import { NODE_KINDS } from '../../app/document/nodeKinds';
import { sweep, type SweepStep, type SweepUnit } from './graphSweep';
import { missingOf } from '../node/useGraphSweep';
import type { GraphEdge, GraphNode } from '../../app/graph';

/**
 * Generating a graph front to back: ✨ writes every empty node, in the
 * order the executor runs them, and stops at the first failure.
 */

function node(id: string, type = 'code'): GraphNode {
  return NODE_KINDS[type as GraphNode['node_type']].create(id);
}

function edge(from: string, to: string): GraphEdge {
  return {
    id: `${from}->${to}`,
    source_node_id: from, source_port_id: 'output',
    target_node_id: to, target_port_id: 'text',
  } as GraphEdge;
}

/** A unit that always succeeds, recording the order it was run in. */
function ok(seen: string[], id: string): SweepUnit {
  return { write: async () => { seen.push(id); } };
}

async function collect(gen: AsyncGenerator<SweepStep>): Promise<SweepStep[]> {
  const steps: SweepStep[] = [];
  for await (const step of gen) steps.push(step);
  return steps;
}

describe('sweeping a graph', () => {
  it('generates in the order of the wiring, not of the nodes, and reports one step per node', async () => {
    const seen: string[] = [];
    // Added b, a; wired a -> b.
    const steps = await collect(sweep([node('b'), node('a')], [edge('a', 'b')], {
      unitFor: (n) => ok(seen, n.id),
    }));

    expect(seen).toEqual(['a', 'b']);
    expect(steps.map((s) => s.status)).toEqual(['generated', 'generated']);
  });

  it('stops at a failure instead of writing the rest against nothing', async () => {
    const seen: string[] = [];
    const nodes = [node('a'), node('b'), node('c')];
    const steps = await collect(sweep(nodes, [edge('a', 'b'), edge('b', 'c')], {
      unitFor: (n) => (n.id === 'b'
        ? { write: async () => { throw new Error('the model refused'); } }
        : ok(seen, n.id)),
    }));

    expect(steps.map((s) => s.status)).toEqual(['generated', 'failed']);
    expect(steps[1].message).toBe('the model refused');
    expect(seen).toEqual(['a']);
  });

  it('writes what a node is missing, in order -- input.js where it takes something in, output.js, its body -- and never what somebody wrote', () => {
    const fresh = node('c');
    expect(missingOf(fresh)).toEqual(['input', 'output', 'body']);
    expect(missingOf({ ...fresh, inputs: [] })).toEqual(['output', 'body']);
    const written = { ...fresh, config: { ...fresh.config, input_definition: 'module.exports = { "input": "a" };', output_definition: 'module.exports = { "output": 1 };' } };
    expect(missingOf(written)).toEqual(['body']);
    expect(missingOf({ ...written, config: { ...written.config, code: 'function run() { return { output: 1 }; }' } })).toEqual([]);
    // A stub is nothing written: a folder read back holds `module.exports = null;` until ✨ writes it.
    expect(missingOf({ ...fresh, config: { ...fresh.config, input_definition: 'module.exports = null;' } })).toEqual(['input', 'output', 'body']);
    // A data node writes its data, and a node ✨ writes nothing for, nothing.
    expect(missingOf(node('d', 'data'))).toEqual(['body']);
    expect(missingOf(node('o', 'end'))).toEqual([]);
  });
});
