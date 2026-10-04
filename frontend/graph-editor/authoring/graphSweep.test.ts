import { describe, it, expect, vi } from 'vitest';
import { NODE_KINDS } from '../../app/document/nodeKinds';
import { generationOrder, missingExamples, sweep, type SweepStep, type SweepUnit } from './graphSweep';
import { missingOf } from './useGraphSweep';
import type { GraphEdge, GraphNode } from '../../app/graph';

/**
 * Generating a graph front to back.
 *
 * The order is the engine's — asserted here only in that this uses it, not
 * a second copy of it — and the rules around it are what this file is about:
 * what stops a sweep, what merely reports, and what it refuses to guess at.
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

describe('the order a graph is generated in', () => {
  it('follows the wiring, not the order nodes were added', () => {
    const [a, b, c] = [node('a'), node('b'), node('c')];
    // Added c, b, a; wired a -> b -> c.
    const order = generationOrder([c, b, a], [edge('a', 'b'), edge('b', 'c')]);
    expect(order.map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('refuses a graph that cannot run, the way the engine does', () => {
    // A two-node cycle with no memory element to absolve it. There is no order
    // to generate in, and inventing one would write every node against a guess
    // while looking like it worked.
    const [a, b] = [node('a'), node('b')];
    expect(() => generationOrder([a, b], [edge('a', 'b'), edge('b', 'a')]))
      .toThrow(/cycle/i);
  });
});

describe('sweeping a graph', () => {
  it('generates in order and reports one step per node', async () => {
    const seen: string[] = [];
    const nodes = [node('a'), node('b')];
    const steps = await collect(sweep(nodes, [edge('a', 'b')], {
      unitFor: (n) => ok(seen, n.id),
    }));

    expect(seen).toEqual(['a', 'b']);
    expect(steps.map((s) => s.status)).toEqual(['generated', 'generated']);
  });

  it('skips a node with nothing to generate without calling anything', async () => {
    const steps = await collect(sweep([node('a')], [], { unitFor: () => undefined }));
    expect(steps).toEqual([expect.objectContaining({ status: 'skipped' })]);
  });

  it('reports a node that is missing its request, and keeps going', async () => {
    const seen: string[] = [];
    const nodes = [node('a'), node('b')];
    const steps = await collect(sweep(nodes, [edge('a', 'b')], {
      unitFor: (n) => (n.id === 'a'
        ? { guard: () => 'Say what this node should do first.', write: async () => {} }
        : ok(seen, n.id)),
    }));

    expect(steps.map((s) => s.status)).toEqual(['blocked', 'generated']);
    // A node with no request of its own may already hold a body that works.
    expect(seen).toEqual(['b']);
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

  it('stops when the toolbar says so, between nodes', async () => {
    const seen: string[] = [];
    const nodes = [node('a'), node('b')];
    const stopped = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    const steps = await collect(sweep(nodes, [edge('a', 'b')], {
      unitFor: (n) => ok(seen, n.id), stopped,
    }));

    expect(seen).toEqual(['a']);
    expect(steps).toHaveLength(1);
  });
});

describe('what a sweep would have to guess at', () => {
  it('names a folder node with no folder, and not one with a folder set', () => {
    const source = node('src', 'folder');
    expect(missingExamples([source], []).map((n) => n.id)).toEqual(['src']);

    source.config.path = 'data/statements';
    expect(missingExamples([source], [])).toEqual([]);
  });

  it('leaves alone a data node, whose value is its own example', () => {
    expect(missingExamples([node('src', 'data')], [])).toEqual([]);
  });

  it('leaves alone a node that is fed by another, which will describe itself', () => {
    const source = node('src', 'folder');
    const fed = node('b');
    expect(missingExamples([source, fed], [edge('src', 'b')]).map((n) => n.id)).toEqual(['src']);
    expect(missingExamples([fed], [edge('src', 'b')])).toEqual([]);
  });
});

describe('a file picker on the page as a source', () => {
  const picker = (value: string, sends = true) => ({
    id: 'w1', kind: 'input_picker', label: 'Pick', value, mode: 'file', ...(sends ? { sends_to: ['go'] } : {}),
  }) as never;

  it('is flagged like an unfed file input, when it has no default path', () => {
    expect(missingExamples([], [], [picker('')]).map((source) => source.id)).toEqual(['w1']);
  });

  it('is left alone once a default path is set, or while it sends to nothing', () => {
    expect(missingExamples([], [], [picker('/data/sample.csv')])).toEqual([]);
    expect(missingExamples([], [], [picker('', false)])).toEqual([]);
  });
});

describe('what a sweep writes of a node', () => {
  it('is what it is missing, in order -- input.js where it takes something in, output.js, its body -- and never what somebody wrote', () => {
    const fresh = node('c');
    expect(missingOf(fresh)).toEqual(['input', 'output', 'body']);
    expect(missingOf({ ...fresh, inputs: [] })).toEqual(['output', 'body']);
    const written = { ...fresh, config: { ...fresh.config, input_definition: 'module.exports = { "input": "a" };', output_definition: 'module.exports = { "output": 1 };' } };
    expect(missingOf(written)).toEqual(['body']);
    expect(missingOf({ ...written, config: { ...written.config, code: 'function run() { return { output: 1 }; }' } })).toEqual([]);
    // A stub is nothing written: a folder read back holds `module.exports = null;` until ✨ writes it.
    expect(missingOf({ ...fresh, config: { ...fresh.config, input_definition: 'module.exports = null;' } })).toEqual(['input', 'output', 'body']);
  });

  it('is its data for a data node, and nothing for a node ✨ writes nothing for', () => {
    expect(missingOf(node('d', 'data'))).toEqual(['body']);
    expect(missingOf(node('o', 'end'))).toEqual([]);
  });
});
