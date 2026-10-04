import { describe, it, expect } from 'vitest';
import type { Graph, GraphNode } from '../graph.ts';
import { executeGraph, inputsFor, memoryFeedbackEdges, runNodeAlone, topologicalLevels } from './executor.ts';
import { NodeRunner } from '../nodes/NodeRunner.ts';
import { type Runtime } from '../nodes/Runtime.ts';
import { registry } from '../nodes/registry.ts';
import { edge, graphOf, quietRuntime } from '../test/fakes.ts';

function node(id: string, type = 'code', config: Record<string, unknown> = {}): GraphNode {
  return {
    id, node_type: type as GraphNode['node_type'], label: id, description: '',
    position: { x: 0, y: 0 }, inputs: [], outputs: [], config,
  };
}

/** A data node holding *value*, on its `output`. */
const held = (id: string, value: unknown): GraphNode => ({
  ...node(id, 'data', { data_value: value }),
  outputs: [{ id: 'output', name: 'output', kind: 'output', data_type: 'any', multi: false, required: false, description: '' }],
});

/** A runtime with no world attached: these tests are about ordering, not doing. */
const nowhere = quietRuntime();

describe('a loop', () => {
  it('runs only through a node that remembers: the wire into it settles for the next round; a loop of forgetful nodes is refused', async () => {
    const forgetful = [node('a'), node('b')];
    const forgetfulLoop = [edge('e1', 'a', 'o', 'b', 'i'), edge('e2', 'b', 'o', 'a', 'i')];
    expect(memoryFeedbackEdges(forgetful, forgetfulLoop, registry).size).toBe(0);
    expect(() => topologicalLevels(forgetful, forgetfulLoop, new Set())).toThrow(/cycle/);

    // data remembers; code does not: the value the data node holds is what breaks the loop.
    const store = node('store', 'data', { data_value: 'old' });
    const step = node('step', 'code', { code: 'x', language: 'js' });
    step.outputs = [{ id: 'output', name: 'o', kind: 'output', data_type: 'any', multi: false, required: false, description: '' }];
    const loop = [edge('read', 'store', 'output', 'step', 'input'), edge('write', 'step', 'output', 'store', 'input')];
    expect([...memoryFeedbackEdges([store, step], loop, registry)]).toEqual(['write']);
    await executeGraph(graphOf([store, step], loop), { runtime: { ...nowhere, code: { run: async () => ({ output: 'fresh' }) } }, registry });
    expect(store.config.data_value).toBe('fresh');
  });
});

describe('a failure', () => {
  class Boom extends NodeRunner {
    readonly nodeType = 'code' as const;
    async execute(): Promise<Record<string, unknown>> { throw new Error('the body blew up'); }
  }
  const withBoom = { node: (type: string) => (type === 'code' ? new Boom() : registry.node(type)) } as never;
  const failing = (config: Record<string, unknown>): GraphNode => ({
    ...node('bad', 'code', config),
    outputs: [
      { id: 'value', name: 'Value', kind: 'output', data_type: 'any', multi: false, required: false, description: '' },
      { id: 'error', name: 'Error', kind: 'output', data_type: 'text', multi: false, required: false, description: '' },
    ],
  });
  const run = (nodes: GraphNode[], edges: ReturnType<typeof edge>[]) => executeGraph(graphOf(nodes, edges), { runtime: nowhere, registry: withBoom });
  const status = (result: Awaited<ReturnType<typeof run>>) => Object.fromEntries(result.node_results.map((r) => [r.node_id, r.status]));

  it('skips what depended on it and goes on with the rest -- unless the node catches its failure', async () => {
    const plain = await run([failing({}), node('after', 'end'), held('elsewhere', 'x')], [edge('e', 'bad', 'value', 'after', 'value')]);
    expect(status(plain)).toEqual({ bad: 'error', after: 'skipped', elsewhere: 'success' });
    expect(plain.status).toBe('partial');
    expect(plain.error).toMatch(/"bad" failed: the body blew up/);

    // `catch_errors`: the node still throws, the executor decides what that costs.
    const caught = await run([failing({ catch_errors: true }), node('after', 'end')], [edge('e', 'bad', 'error', 'after', 'value')]);
    expect(status(caught)).toEqual({ bad: 'partial', after: 'success' });
    expect(caught.node_results[0].outputs).toEqual({ value: null, error: 'the body blew up' });

    const unwired = await run([failing({ catch_errors: true })], []);
    expect(unwired.status).toBe('partial');
    expect(unwired.error).toBeNull();
  });
});

describe('a result that is handed in', () => {
  it('is taken as the node\'s own, the node does not run, and the answer travels on', async () => {
    let ran = 0;
    class Counts extends NodeRunner {
      readonly nodeType = 'code' as const;
      async execute(_node: GraphNode, inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
        ran += 1;
        return { output: `saw ${String(inputs.value)}` };
      }
    }
    const counting = { node: (type: string) => (type === 'code' ? new Counts() : registry.node(type)) };

    const result = await executeGraph(
      graphOf([node('source'), node('after'), node('show', 'end')], [
        edge('e1', 'source', 'output', 'after', 'value'),
        edge('e2', 'after', 'output', 'show', 'value'),
      ]),
      { runtime: nowhere, registry: counting as never, given: { source: { output: 'a value' } } },
    );

    // Only the two nodes that were not answered ran, and the answer travelled.
    expect(ran).toBe(1);
    const source = result.node_results.filter((r) => r.node_id === 'source');
    expect(source).toHaveLength(1);
    expect(source[0]).toMatchObject({ status: 'success', outputs: { output: 'a value' } });
    expect(result.node_results.find((r) => r.node_id === 'after')?.outputs).toEqual({ output: 'saw a value' });
  });
});

describe('a node run once per item', () => {
  /** A per_item code node fed a list of three, whose runner fails on the word "bad". */
  function batchOf(items: string[], catches = false): Graph {
    return {
      metadata: { name: 'g' } as Graph['metadata'],
      nodes: [
        { ...node('a', 'data', { data_value: items, data_format: 'structure' }), outputs: [{ id: 'output', name: 'O', kind: 'output', data_type: 'json', multi: true, required: false, description: '' }] },
        {
          ...node('work', 'code', { code: 'function run(i) { return i; }', batch_mode: 'per_item', ...(catches ? { catch_errors: true } : {}) }),
          inputs: [{ id: 'items', name: 'Items', kind: 'input', data_type: 'any', multi: true, required: false, description: '' }],
          outputs: [
            { id: 'out', name: 'Out', kind: 'output', data_type: 'any', multi: true, required: false, description: '' },
            ...(catches ? [{ id: 'error', name: 'Error', kind: 'output' as const, data_type: 'text' as const, multi: false, required: false, description: '' }] : []),
          ],
        },
      ],
      edges: [edge('e', 'a', 'output', 'work', 'items')],
    };
  }
  const picky: Runtime = {
    ...nowhere,
    code: { run: async (_body, inputs) => { if (String(inputs.items).includes('bad')) throw new Error('boom'); return { out: inputs.items }; } },
  };
  const workResult = async (items: string[], catches = false) =>
    (await executeGraph(batchOf(items, catches), { runtime: picky, registry })).node_results.find((r) => r.node_id === 'work')!;

  it('loses the failed item, not the node; an error only when every item fails; the reason on the error port of a node that catches', async () => {
    const some = await workResult(['ok', 'bad', 'ok']);
    expect(some.status).toBe('partial');
    expect(some.error).toContain('1 of 3 items failed');
    expect(some.error).toContain('boom');
    expect(some.outputs.out).toEqual(['ok', null, 'ok']);

    expect((await workResult(['bad', 'bad'])).status).toBe('error');

    // Once for the node, as text: a [null] on the port would run what is wired to it on nothing.
    const caught = await workResult(['ok', 'bad'], true);
    expect(caught.status).toBe('partial');
    expect(caught.outputs.out).toEqual(['ok', null]);
    expect(caught.outputs.error).toBe(caught.error);
    expect(caught.outputs.error).toContain('boom');
    expect((await workResult(['ok', 'ok'], true)).outputs.error).toBeUndefined();
  });
});

describe('Stop', () => {
  it('hands back what finished before it, as it arrived', async () => {
    const stop = new AbortController();
    const runtime = quietRuntime({
      code: { run: async (body, inputs, signal) => {
        if (signal?.aborted) throw new Error('Stopped.');
        if (body.includes('SLOW')) {
          setTimeout(() => stop.abort(), 5);
          await new Promise((_, reject) => signal!.addEventListener('abort', () => reject(new Error('Stopped.'))));
        }
        return new Function('inputs', `${body}; return run(inputs);`)(inputs) as Record<string, unknown>;
      } },
    });
    const graph = graphOf(
      [
        node('src', 'code', { code: 'function run() { return { rows: [1, 2] }; }' }),
        node('table', 'end'),
        node('slow', 'code', { code: '/* SLOW */ function run() { return { x: 1 }; }' }),
      ],
      [edge('a', 'src', 'rows', 'table', 'value'), edge('b', 'src', 'rows', 'slow', 'rows')],
    );
    const run = await executeGraph(graph, { runtime, registry, signal: stop.signal });
    expect(run.status).toBe('cancelled');
    expect(run.node_results.find((r) => r.node_id === 'table')!.inputs).toEqual({ value: [1, 2] });
  });
});

describe('one node tried by itself', () => {
  const runtime = (ran: string[] = []) => quietRuntime({
    code: { run: async (body, inputs) => new Function('inputs', `${body}; return run(inputs);`)(inputs) },
    report: (event) => { if (event.type === 'node_start') ran.push(event.node_id); },
  });

  it('fails when what feeds it failed or stood still, rather than running on nothing and succeeding; runs what computes the ◆ of what feeds it', async () => {
    // run-node and the MCP server's run_node, with no inputs given.
    const reader = node('reader', 'code', { code: 'function run() { throw new Error("ENOENT: data.csv"); }' });
    const count = node('count', 'code', { code: 'function run(i) { return { n: String(i.text ?? "").length }; }' });
    const failed = await runNodeAlone(graphOf([reader, count], [edge('e', 'reader', 'text', 'count', 'text')]), 'count', undefined, { runtime: runtime(), registry });
    expect(failed.result.status).toBe('error');
    expect(failed.result.error).toMatch(/ENOENT: data\.csv/);

    /** `reader` hangs on `flag`'s ◆, and `target` takes what `reader` read. */
    const flagged = (open: boolean) => graphOf([
      node('flag', 'code', { code: `function run() { return { open: ${open} }; }` }),
      node('reader', 'code', { code: 'function run() { return { text: "the file" }; }' }),
      node('target', 'code', { code: 'function run(i) { return { n: String(i.text ?? "").length }; }' }),
    ], [edge('g', 'flag', 'open', 'reader', '__run'), edge('t', 'reader', 'text', 'target', 'text')]);

    const { inputs } = await inputsFor(flagged(true), 'target', { runtime: runtime(), registry });
    expect(inputs).toEqual({ text: 'the file' });

    const ran: string[] = [];
    const { result } = await runNodeAlone(flagged(false), 'target', undefined, { runtime: runtime(ran), registry });
    expect(result.status).toBe('error');
    expect(result.error).toMatch(/"reader"/);
    expect(ran).not.toContain('target');
  });
});
