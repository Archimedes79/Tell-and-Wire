import { describe, it, expect } from 'vitest';
import type { Graph, GraphNode } from '../graph.ts';
import { executeGraph, inputsFor, runNodeAlone } from './executor.ts';
import { passiveWires, topologicalLevels } from './order.ts';
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

/** A runtime with no world attached: these tests are about ordering, not doing. */
const nowhere = quietRuntime();

describe('a loop', () => {
  it('runs a loop only through a memory: the node that reads it takes its passive before, and it fills and forwards after; a loop that waits for it, or of forgetful nodes, is refused', async () => {
    const forgetful = [node('a'), node('b')];
    const forgetfulLoop = [edge('e1', 'a', 'o', 'b', 'i'), edge('e2', 'b', 'o', 'a', 'i')];
    expect(passiveWires(forgetful, forgetfulLoop, registry).size).toBe(0);
    // Said by name, with the way out.
    expect(() => topologicalLevels(forgetful, forgetfulLoop, registry)).toThrow(/cycle through code node "a", code node "b".*data node/);

    // data remembers; code does not: the value the data node holds is what breaks the loop.
    const store = node('store', 'data', { data_value: { value: 'old' } });
    const step = node('step', 'code', { code: 'x', language: 'js' });
    step.outputs = [{ id: 'output', name: 'o', kind: 'output', data_type: 'any', multi: false, required: false, description: '' }];
    // The step takes the one field it wants of how the memory was.
    step.inputs = [{ id: 'input', name: 'input', kind: 'input', data_type: 'any', multi: false, required: false, description: '', field: 'value' }];
    const loop = [edge('read', 'store', 'before', 'step', 'input'), edge('write', 'step', 'output', 'store', 'value')];
    // The passive wire reads what it held; the step writes back, and the node forwards what it then holds.
    expect([...passiveWires([store, step], loop, registry)]).toEqual(['read']);
    // Waiting for the node to be filled while it waits for the step is a cycle, said with the way out.
    expect(() => topologicalLevels([store, step], [edge('wait', 'store', 'value', 'step', 'input'), edge('write', 'step', 'output', 'store', 'value')], registry))
      .toThrow(/data node "store".*"before" output/);
    const graph = graphOf([store, step], loop);
    const runtime = { ...nowhere, code: { run: async (_body: string, inputs: Record<string, unknown>) => ({ output: `${String(inputs.input)}+` }) } };
    const first = await executeGraph(graph, { runtime, registry });
    expect(store.config.data_value).toEqual({ value: 'old+' });
    expect(store.config.data_round).toBe(1);
    // The step read 'old'; the node filled from it and forwarded 'old+', as the round number 1.
    const made = first.node_results.find((result) => result.node_id === 'store')!;
    expect(made.inputs).toEqual({ value: 'old+' });
    expect(made.outputs).toMatchObject({ value: 'old+', round: 1 });
    await executeGraph(graph, { runtime, registry });
    expect(store.config.data_value).toEqual({ value: 'old++' });
    expect(store.config.data_round).toBe(2);

    // Whatever reads it after the loop gets what it forwards, in the same round: the node fills, then forwards.
    const fill = node('fill', 'data', { data_value: { value: 'old' } });
    const make = node('make', 'code', { code: 'make', language: 'js' });
    const look = node('look', 'code', { code: 'look', language: 'js' });
    for (const one of [make, look]) one.outputs = step.outputs;
    make.inputs = step.inputs;
    const through = graphOf([make, fill, look], [
      edge('put', 'make', 'output', 'fill', 'value'), edge('back', 'fill', 'before', 'make', 'input'), edge('get', 'fill', 'value', 'look', 'input'),
    ]);
    expect([...passiveWires(through.nodes, through.edges, registry)]).toEqual(['back']);
    const passes = { ...nowhere, code: { run: async (body: string, inputs: Record<string, unknown>) => ({ output: `${body === 'make' ? 'new from' : 'saw'} ${String(inputs.input)}` }) } };
    const seen = await executeGraph(through, { runtime: passes, registry });
    expect(seen.node_results.find((result) => result.node_id === 'look')!.outputs).toEqual({ output: 'saw new from old' });
    expect(fill.config.data_value).toEqual({ value: 'new from old' });

    // A memory that did not run keeps what it kept and counts no round: its ◆ stayed shut, so what was written to it is not taken.
    const shy = node('shy', 'data', { data_value: { value: 'old' } });
    const no = node('no', 'code', { code: 'no', language: 'js' });
    const writer = node('writer', 'code', { code: 'writer', language: 'js' });
    for (const one of [no, writer]) one.outputs = step.outputs;
    const shut = graphOf([no, writer, shy], [edge('when', 'no', 'output', 'shy', '__run'), edge('put2', 'writer', 'output', 'shy', 'value')]);
    const says = { ...nowhere, code: { run: async (body: string) => ({ output: body === 'no' ? false : 'written' }) } };
    await executeGraph(shut, { runtime: says, registry });
    expect(shy.config.data_value).toEqual({ value: 'old' });
    expect(shy.config.data_round).toBeUndefined();

    // A port that takes one value of what arrives takes that value, as the node fills from it and as it is kept.
    const picky = node('picky', 'data', { data_value: { value: 'old' } });
    picky.inputs = [{ ...step.outputs[0], id: 'value', kind: 'input', field: 'a' }];
    const giver = node('giver', 'code', { code: 'giver', language: 'js' });
    giver.outputs = step.outputs;
    await executeGraph(graphOf([giver, picky], [edge('pick', 'giver', 'output', 'picky', 'value')]), {
      runtime: { ...nowhere, code: { run: async () => ({ output: { a: 'the a', b: 'the b' } }) } }, registry,
    });
    expect(picky.config.data_value).toEqual({ value: 'the a' });
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
    const plain = await run([failing({}), node('after', 'end'), node('elsewhere', 'data', { data_value: { value: 'x' } })], [edge('e', 'bad', 'value', 'after', 'value')]);
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

  it('a node that catches its failure leaves the data node it feeds as it was, and hands it only the reason', async () => {
    // A counter that held 6 went to null, and the next round counted from 1.
    const counter = node('counter', 'data', { data_value: { count: 6 } });
    const reason = node('reason', 'data', { data_value: { because: null } });
    await run(
      [failing({ catch_errors: true }), counter, reason],
      [edge('v', 'bad', 'value', 'counter', 'count'), edge('r', 'bad', 'error', 'reason', 'because')],
    );
    expect(counter.config.data_value).toEqual({ count: 6 });
    expect(reason.config.data_value).toEqual({ because: 'the body blew up' });
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
        node('a', 'data', { data_value: { items } }),
        {
          ...node('work', 'code', { code: 'function run(i) { return i; }', batch_mode: 'per_item', ...(catches ? { catch_errors: true } : {}) }),
          inputs: [{ id: 'items', name: 'Items', kind: 'input', data_type: 'any', multi: true, required: false, description: '' }],
          outputs: [
            { id: 'out', name: 'Out', kind: 'output', data_type: 'any', multi: true, required: false, description: '' },
            ...(catches ? [{ id: 'error', name: 'Error', kind: 'output' as const, data_type: 'text' as const, multi: false, required: false, description: '' }] : []),
          ],
        },
      ],
      edges: [edge('e', 'a', 'items', 'work', 'items')],
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
