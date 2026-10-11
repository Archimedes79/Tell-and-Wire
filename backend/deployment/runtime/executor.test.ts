import { describe, it, expect } from 'vitest';
import type { Graph, GraphNode } from '../../../graph/graph.ts';
import { executeGraph, inputsFor, runNodeAlone } from './executor.ts';
import { readingWires, topologicalLevels } from '../../../graph/order.ts';
import { NodeRunner, type Runners } from './nodes/NodeRunner.ts';
import { runners } from './nodes/registry.ts';
import { type Runtime } from '../../../graph/nodes/Runtime.ts';
import { registry } from '../../../graph/nodes/registry.ts';
import { edge, graphOf, node as nodeWith, quietRuntime } from './test/fakes.ts';

function node(id: string, type = 'code', config: Record<string, unknown> = {}): GraphNode {
  return {
    id, node_type: type as GraphNode['node_type'], label: id, description: '',
    position: { x: 0, y: 0 }, inputs: [], outputs: [], config,
  };
}

/** A runtime with no world attached: these tests are about ordering, not doing. */
const nowhere = quietRuntime();

describe('a loop', () => {
  it('runs a loop only through a memory: the node that reads it runs before it, by a wire back that carries what it held, and it fills and forwards after; a loop of forgetful nodes, or one that waits for it, is refused', async () => {
    const forgetful = [node('a'), node('b')];
    const forgetfulLoop = [edge('e1', 'a', 'o', 'b', 'i'), edge('e2', 'b', 'o', 'a', 'i')];
    expect(readingWires(forgetful, forgetfulLoop, registry).size).toBe(0);
    // Said by name, with the way out.
    expect(() => topologicalLevels(forgetful, forgetfulLoop, registry)).toThrow(/cycle through code node "a", code node "b".*data node/);

    // data remembers; code does not: the value the data node holds is what breaks the loop.
    const store = node('store', 'data', { data_value: { value: 'old' } });
    const step = node('step', 'code', { code: 'x', language: 'js' });
    step.outputs = [{ id: 'output', name: 'o', kind: 'output', data_type: 'any', multi: false, required: false, description: '' }];
    step.inputs = [{ id: 'input', name: 'input', kind: 'input', data_type: 'any', multi: false, required: false, description: '' }];
    const loop = [edge('read', 'store', 'value', 'step', 'input'), edge('write', 'step', 'output', 'store', 'value')];
    // The wire that closes the loop reads what the memory held; the step writes back, and the node forwards what it then holds.
    expect([...readingWires([store, step], loop, registry)]).toEqual(['read']);
    // A schedule says it by where the nodes stand: the step before the memory is the read; after it, the wire waits for the node to be filled
    // while the node waits for the step, which is a cycle, said with the way out.
    expect([...readingWires([store, step], loop, registry, new Map([['step', 0], ['store', 1]]))]).toEqual(['read']);
    expect(() => topologicalLevels([store, step], loop, registry, new Map([['store', 0], ['step', 1]])))
      .toThrow(/cycle through data node "store", code node "step".*the schedule stands the node that reads it after it/);
    const graph = graphOf([store, step], loop);
    const runtime = { ...nowhere, code: { run: async (_body: string, inputs: Record<string, unknown>) => ({ output: `${String(inputs.input)}+` }) } };
    const first = await executeGraph(graph, { runtime, registry });
    expect(store.config.data_value).toEqual({ value: 'old+' });
    // The step read 'old'; the node filled from it and forwarded 'old+'.
    const made = first.node_results.find((result) => result.node_id === 'store')!;
    expect(made.inputs).toEqual({ value: 'old+' });
    expect(made.outputs).toEqual({ value: 'old+' });
    await executeGraph(graph, { runtime, registry });
    expect(store.config.data_value).toEqual({ value: 'old++' });
    // With the schedule it is the same loop when the step stands before the memory, and none when it does not.
    await executeGraph({ ...graph, schedule: ['step store'] }, { runtime, registry });
    expect(store.config.data_value).toEqual({ value: 'old+++' });
    await expect(executeGraph({ ...graph, schedule: ['store step'] }, { runtime, registry })).rejects.toThrow(/cycle through data node "store", code node "step"/);

    // Whatever reads it after the loop gets what it forwards, in the same round: the node fills, then forwards.
    const fill = node('fill', 'data', { data_value: { value: 'old' } });
    const make = node('make', 'code', { code: 'make', language: 'js' });
    const look = node('look', 'code', { code: 'look', language: 'js' });
    for (const one of [make, look]) one.outputs = step.outputs;
    make.inputs = step.inputs;
    const through = graphOf([make, fill, look], [
      edge('put', 'make', 'output', 'fill', 'value'), edge('back', 'fill', 'value', 'make', 'input'), edge('get', 'fill', 'value', 'look', 'input'),
    ]);
    expect([...readingWires(through.nodes, through.edges, registry)]).toEqual(['back']);
    const passes = { ...nowhere, code: { run: async (body: string, inputs: Record<string, unknown>) => ({ output: `${body === 'make' ? 'new from' : 'saw'} ${String(inputs.input)}` }) } };
    const seen = await executeGraph(through, { runtime: passes, registry });
    expect(seen.node_results.find((result) => result.node_id === 'look')!.outputs).toEqual({ output: 'saw new from old' });
    expect(fill.config.data_value).toEqual({ value: 'new from old' });

    // A memory that did not run keeps what it kept: its ◆ stayed shut, so what was written to it is not taken.
    const shy = node('shy', 'data', { data_value: { value: 'old' } });
    const no = node('no', 'code', { code: 'no', language: 'js' });
    const writer = node('writer', 'code', { code: 'writer', language: 'js' });
    for (const one of [no, writer]) one.outputs = step.outputs;
    const shut = graphOf([no, writer, shy], [edge('when', 'no', 'output', 'shy', '__run'), edge('put2', 'writer', 'output', 'shy', 'value')]);
    const says = { ...nowhere, code: { run: async (body: string) => ({ output: body === 'no' ? false : 'written' }) } };
    const shutRound = await executeGraph(shut, { runtime: says, registry });
    expect(shy.config.data_value).toEqual({ value: 'old' });
    // It stands on what it holds, not on nothing: whatever reads it still gets the content.
    expect(shutRound.node_results.find((result) => result.node_id === 'shy')).toMatchObject({ status: 'skipped', outputs: { value: 'old' } });

    // A register that keeps the value before: it reads its own field as the round began, so what it settles is the old count, not the one just filled.
    const register = node('register', 'data', { data_value: { count: 0, prev: 0 } });
    const bump = node('bump', 'code', { code: 'bump', language: 'js' });
    bump.inputs = step.inputs;
    bump.outputs = step.outputs;
    const counting = graphOf([bump, register], [
      edge('now', 'register', 'count', 'bump', 'input'), edge('up', 'bump', 'output', 'register', 'count'), edge('before', 'register', 'count', 'register', 'prev'),
    ]);
    const adds = { ...nowhere, code: { run: async (_body: string, inputs: Record<string, unknown>) => ({ output: Number(inputs.input) + 1 }) } };
    await executeGraph(counting, { runtime: adds, registry });
    await executeGraph(counting, { runtime: adds, registry });
    expect(register.config.data_value).toEqual({ count: 2, prev: 1 });

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

describe('an input that takes a field', () => {
  it('is handed a list whole where it names a part of it: a list has no parts, and what a small model meant is the list', async () => {
    const source = nodeWith('src', 'code', { code: 'SRC' }, { out: ['items'] });
    const sink = nodeWith('sink', 'code', {}, { in: ['x:src.items'], out: ['x'] });
    const runtime = quietRuntime({ code: { run: async (body, inputs) => (body === 'SRC' ? { items: [1, 2, 3] } : inputs) } });
    const result = await executeGraph(graphOf([source, sink], [edge('e', 'src', 'items', 'sink', 'x')]), { runtime, registry });
    expect(result.node_results.find((one) => one.node_id === 'sink')?.outputs).toEqual({ x: [1, 2, 3] });
  });
});

describe('a failure', () => {
  class Boom extends NodeRunner {
    async execute(): Promise<Record<string, unknown>> { throw new Error('the body blew up'); }
  }
  const withBoom: Runners = { node: (type) => (type === 'code' ? new Boom(registry.node('code')!) : runners.node(type)) };
  const failing = (config: Record<string, unknown>): GraphNode => ({
    ...node('bad', 'code', config),
    outputs: [
      { id: 'value', name: 'Value', kind: 'output', data_type: 'any', multi: false, required: false, description: '' },
      { id: 'error', name: 'Error', kind: 'output', data_type: 'text', multi: false, required: false, description: '' },
    ],
  });
  const run = (nodes: GraphNode[], edges: ReturnType<typeof edge>[]) => executeGraph(graphOf(nodes, edges), { runtime: nowhere, registry, runners: withBoom });
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
      async execute(_node: GraphNode, inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
        ran += 1;
        return { output: `saw ${String(inputs.value)}` };
      }
    }
    const counting: Runners = { node: (type) => (type === 'code' ? new Counts(registry.node('code')!) : runners.node(type)) };

    const result = await executeGraph(
      graphOf([node('source'), node('after'), node('show', 'end')], [
        edge('e1', 'source', 'output', 'after', 'value'),
        edge('e2', 'after', 'output', 'show', 'value'),
      ]),
      { runtime: nowhere, registry, runners: counting, given: { source: { output: 'a value' } } },
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

describe('a schedule', () => {
  it('sets the order of what stands beside each other, and refuses to run when a wire contradicts it', async () => {
    const [a, b] = [node('a', 'code', { code: 'x', language: 'js' }), node('b', 'code', { code: 'x', language: 'js' })];
    const ran = async (graph: Graph): Promise<string[]> => (await executeGraph(graph, { runtime: nowhere, registry })).node_results.map((one) => one.node_id);
    expect(await ran(graphOf([a, b], []))).toEqual(['a', 'b']);
    expect(await ran({ ...graphOf([a, b], []), schedule: ['b a'] })).toEqual(['b', 'a']);
    // Beside each other: top to bottom.
    expect(await ran({ ...graphOf([a, b], []), schedule: ['b', 'a'] })).toEqual(['b', 'a']);
    const wired = { ...graphOf([a, b], [edge('e', 'a', 'out', 'b', 'in')]), schedule: ['b a'] };
    await expect(executeGraph(wired, { runtime: nowhere, registry })).rejects.toThrow(/schedule puts "b" before "a"/);
  });
});
