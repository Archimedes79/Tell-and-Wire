import { describe, it, expect } from 'vitest';
import type { Graph, GraphNode } from '../graph.ts';
import { executeGraph } from './executor.ts';
import { edge, graphOf, quietRuntime } from '../test/fakes.ts';
import { registry } from '../nodes/registry.ts';
import { RUN_PORT } from './triggers.ts';
import { Latch } from './latch.ts';

/**
 * The ◆ as a gate, a start point that says whether the round began there,
 * and what a node is left holding while its gate is shut.
 *
 * The bodies run for real (in this process, not the sandbox): what is tested
 * is which nodes run and what reaches them, and a router has to compute.
 */

/** A port, by name; `name:field` takes that one value of what arrives (`Port.field`). */
function port(spec: string, kind: 'input' | 'output') {
  const [name, field] = spec.split(':');
  return { id: name, name, kind, data_type: 'any' as const, multi: false, required: false, description: '', ...(field ? { field } : {}) };
}

function node(id: string, type = 'code', config: Record<string, unknown> = {}, ports: { in?: string[]; out?: string[] } = {}): GraphNode {
  return {
    id, node_type: type as GraphNode['node_type'], label: id, description: '', position: { x: 0, y: 0 },
    config: type === 'code' ? { code: 'function run(inputs) { return inputs; }', ...config } : config,
    inputs: (ports.in ?? []).map((name) => port(name, 'input')),
    outputs: (ports.out ?? []).map((name) => port(name, 'output')),
  };
}

/** A start point the page starts, holding what the page sent it last. */
const start = (id: string, values: Record<string, unknown> = {}) => node(id, 'start', { started_by: 'page', values });

let ran: string[] = [];
const runtime = quietRuntime({
  code: { run: async (body, inputs) => new Function('inputs', `${body}; return run(inputs);`)(inputs) as Record<string, unknown> },
  report: (event) => { if (event.type === 'node_start') ran.push(event.node_id); },
});

/**
 * Read → Summarize, used through a page: the Read button fires a start point
 * wired into the reader's ◆; choosing a length fires one wired into the
 * summarizer, sent the length.
 */
function reader(length = 'short'): Graph {
  return graphOf(
    [
      start('read'),
      start('length', { length }),
      node('reader', 'code', { code: 'function run() { return { text: "the file" }; }' }, { out: ['text'] }),
      node('summary', 'code', { code: 'function run(i) { return { out: i.length + ": " + i.text }; }' }, { in: ['text', 'length:length'], out: ['out'] }),
      node('shown', 'end', {}, { in: ['value'] }),
    ],
    [
      edge('gate', 'read', 'data', 'reader', RUN_PORT),
      edge('text', 'reader', 'text', 'summary', 'text'),
      edge('len', 'length', 'data', 'summary', 'length'),
      edge('show', 'summary', 'out', 'shown', 'value'),
    ],
  );
}

const READ = { node_id: 'read', port_id: 'data' };
const LENGTH = { node_id: 'length', port_id: 'data' };
const result = (run: Awaited<ReturnType<typeof executeGraph>>, id: string) => run.node_results.find((r) => r.node_id === id);
const began = (run: Awaited<ReturnType<typeof executeGraph>>, id: string) => (result(run, id)!.outputs.data as { event: unknown }).event !== null;

describe('the ◆ is a gate', () => {
  it('is opened by the start point the round began at; for another event it stays shut and what the node made last stands; with nothing made yet what needs it waits', async () => {
    const latch = new Latch();
    ran = [];
    const first = await executeGraph(reader(), { runtime, registry, trigger: READ, latch });
    expect(ran).toEqual(['read', 'length', 'reader', 'summary', 'shown']);
    expect(began(first, 'read')).toBe(true);
    expect(result(first, 'shown')!.inputs.value).toBe('short: the file');

    ran = [];
    const second = await executeGraph(reader('long'), { runtime, registry, trigger: LENGTH, latch });
    expect(ran).toEqual(['read', 'length', 'summary', 'shown']);     // the reader stood still
    expect(began(second, 'read')).toBe(false);                        // not pressed *this* round
    expect(result(second, 'reader')).toMatchObject({ status: 'skipped', held: true, outputs: { text: 'the file' } });
    expect(result(second, 'shown')!.inputs.value).toBe('long: the file');

    // A gate that never opened has nothing to hold.
    ran = [];
    const fresh = await executeGraph(reader(), { runtime, registry, trigger: LENGTH, latch: new Latch() });
    expect(ran).toEqual(['read', 'length']);
    expect(result(fresh, 'reader')).toMatchObject({ status: 'skipped', outputs: {} });
    expect(result(fresh, 'reader')!.held).toBeUndefined();
    expect(result(fresh, 'summary')!.status).toBe('skipped');
    expect(fresh.status).toBe('success');
  });
});

/**
 * Two start points into one router, which decides with code what each of
 * them starts. The chart kind is sent with "go".
 */
function routed(decide: string): Graph {
  return graphOf(
    [
      start('go', { kind: 'Chart' }),
      start('tick'),
      node('router', 'code', { code: decide }, { in: ['pressed', 'tick'], out: ['draw', 'refresh'] }),
      node('chart', 'code', { code: 'function run() { return { svg: "<svg/>" }; }' }, { out: ['svg'] }),
      node('source', 'code', { code: 'function run() { return { rows: [1] }; }' }, { out: ['rows'] }),
      node('table', 'code', {}, { in: ['rows'], out: ['rows'] }),
    ],
    [
      edge('p', 'go', 'data', 'router', 'pressed'),
      edge('t', 'tick', 'data', 'router', 'tick'),
      edge('d', 'router', 'draw', 'chart', RUN_PORT),
      edge('r', 'router', 'refresh', 'source', RUN_PORT),
      edge('s', 'source', 'rows', 'table', 'rows'),
    ],
  );
}

/** Which round this is, from each start point's package: its event is set only in the round it began. */
const ROUTER = 'function run(i) { return { draw: !!i.pressed.event && i.pressed.values.kind === "Chart", refresh: !!i.tick.event }; }';

describe('a code node that returns booleans is a filter', () => {
  it('knows which event this round is by the package that says it began there, and opens a gate with true and nothing else', async () => {
    ran = [];
    await executeGraph(routed(ROUTER), { runtime, registry, trigger: { node_id: 'go', port_id: 'data' }, latch: new Latch() });
    expect(ran).toEqual(['go', 'tick', 'router', 'chart']);

    ran = [];
    await executeGraph(routed(ROUTER), { runtime, registry, trigger: { node_id: 'tick', port_id: 'data' }, latch: new Latch() });
    expect(ran).toEqual(['go', 'tick', 'router', 'source', 'table']);

    ran = [];
    const truthy = 'function run() { return { draw: "yes", refresh: 1 }; }';
    await executeGraph(routed(truthy), { runtime, registry, trigger: { node_id: 'go', port_id: 'data' }, latch: new Latch() });
    expect(ran).toEqual(['go', 'tick', 'router']);
  });
});

describe('what stood still is not news', () => {
  it('is not handed to an end point again: a round that did not make it does not reach it', async () => {
    // The end point shows what `answer` made; `answer` hangs on "ask".
    const latch = new Latch();
    const graph = (): Graph => graphOf(
      [
        start('ask'),
        start('other', { other: 'a' }),
        node('answer', 'code', { code: 'function run() { return { out: "an answer" }; }' }, { out: ['out'] }),
        node('shown', 'end', {}, { in: ['value'] }),
        node('sink', 'code', {}, { in: ['v:other', 'v2'], out: ['v'] }),
      ],
      [
        edge('g', 'ask', 'data', 'answer', RUN_PORT),
        edge('s', 'answer', 'out', 'shown', 'value'),
        edge('o', 'other', 'data', 'sink', 'v'),
        edge('a', 'answer', 'out', 'sink', 'v2'),
      ],
    );
    const once = await executeGraph(graph(), { runtime, registry, trigger: { node_id: 'ask', port_id: 'data' }, latch });
    expect(result(once, 'shown')).toMatchObject({ status: 'success', inputs: { value: 'an answer' } });
    const again = await executeGraph(graph(), { runtime, registry, trigger: { node_id: 'other', port_id: 'data' }, latch });
    expect(result(again, 'answer')).toMatchObject({ held: true });
    expect(result(again, 'shown')).toBeUndefined();
  });
});

describe('what a node holds belongs to its own graph', () => {
  it('is never handed to another graph of the same name', async () => {
    // Two projects, both "Untitled tool", with the same node `c`: the second
    // never ran it, and must not be handed what the first one's `c` made.
    const latch = new Latch();
    const build = (secret: string, open: boolean) => graphOf(
      [
        node('src', 'code', { code: `function run() { return { v: "${secret}" }; }` }, { out: ['v'] }),
        node('flag', 'code', { code: `function run() { return { open: ${open} }; }` }, { out: ['open'] }),
        node('c', 'code', { code: 'function run(i) { return { out: i.x }; }' }, { in: ['x'], out: ['out'] }),
      ],
      [edge('s', 'src', 'v', 'c', 'x'), edge('g', 'flag', 'open', 'c', RUN_PORT)],
    );
    await executeGraph(build('project A data', true), { runtime, registry, latch });
    const second = await executeGraph(build('project B data', false), { runtime, registry, latch });
    expect(result(second, 'c')).toMatchObject({ outputs: {} });
    expect(result(second, 'c')!.held).toBeUndefined();
    // The same graph again is handed what it made.
    const again = await executeGraph(build('project A data', false), { runtime, registry, latch });
    expect(result(again, 'c')).toMatchObject({ held: true, outputs: { out: 'project A data' } });
  });
});
