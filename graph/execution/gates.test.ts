import { describe, it, expect } from 'vitest';
import type { Graph, GraphNode } from '../graph.ts';
import { executeGraph } from './executor.ts';
import { edge, graphOf, quietRuntime } from '../test/fakes.ts';
import { registry } from '../nodes/registry.ts';
import { RUN_PORT } from './triggers.ts';
import { Latch } from './latch.ts';
import { LastOutputs } from './reuse.ts';

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
  it('is opened by the start point the round began at', async () => {
    ran = [];
    const run = await executeGraph(reader(), { runtime, registry, trigger: READ, latch: new Latch() });
    expect(ran).toEqual(['read', 'length', 'reader', 'summary', 'shown']);
    expect(began(run, 'read')).toBe(true);
    expect(result(run, 'shown')!.inputs.value).toBe('short: the file');
  });

  it('stays shut for another event, and what the node made last stands', async () => {
    const latch = new Latch();
    await executeGraph(reader(), { runtime, registry, trigger: READ, latch });
    ran = [];
    const run = await executeGraph(reader('long'), { runtime, registry, trigger: LENGTH, latch });
    expect(ran).toEqual(['read', 'length', 'summary', 'shown']);     // the reader stood still
    expect(began(run, 'read')).toBe(false);                           // not pressed *this* round
    expect(result(run, 'reader')).toMatchObject({ status: 'skipped', held: true, outputs: { text: 'the file' } });
    expect(result(run, 'shown')!.inputs.value).toBe('long: the file');
  });

  it('leaves what needs it waiting when it has made nothing yet', async () => {
    ran = [];
    const run = await executeGraph(reader(), { runtime, registry, trigger: LENGTH, latch: new Latch() });
    expect(ran).toEqual(['read', 'length']);
    expect(result(run, 'reader')).toMatchObject({ status: 'skipped', outputs: {} });
    expect(result(run, 'reader')!.held).toBeUndefined();
    expect(result(run, 'summary')!.status).toBe('skipped');
    expect(run.status).toBe('success');
  });

  it('counts every event as having happened in a run no event started', async () => {
    ran = [];
    const run = await executeGraph(reader(), { runtime, registry });
    expect(ran).toEqual(['read', 'length', 'reader', 'summary', 'shown']);
    expect(began(run, 'read')).toBe(true);
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
  it('knows which event this round is by the package that says it began there', async () => {
    ran = [];
    await executeGraph(routed(ROUTER), { runtime, registry, trigger: { node_id: 'go', port_id: 'data' }, latch: new Latch() });
    expect(ran).toEqual(['go', 'tick', 'router', 'chart']);

    ran = [];
    await executeGraph(routed(ROUTER), { runtime, registry, trigger: { node_id: 'tick', port_id: 'data' }, latch: new Latch() });
    expect(ran).toEqual(['go', 'tick', 'router', 'source', 'table']);
  });

  it('is computed in an event round when it is not downstream of the event itself', async () => {
    // The start point starts `a`, and `n` after it; whether `n` may run is
    // decided by `allow`, which no start point feeds.
    const graph = graphOf(
      [
        start('go'),
        node('a', 'code', { code: 'function run() { return { out: "from a" }; }' }, { in: ['x'], out: ['out'] }),
        node('allow', 'code', { code: 'function run() { return { ok: true }; }' }, { out: ['ok'] }),
        node('n', 'code', { code: 'function run(i) { return { got: i.x }; }' }, { in: ['x'], out: ['got'] }),
      ],
      [edge('p', 'go', 'data', 'a', 'x'), edge('an', 'a', 'out', 'n', 'x'), edge('gate', 'allow', 'ok', 'n', RUN_PORT)],
    );
    const run = await executeGraph(graph, { runtime, registry, latch: new Latch(), trigger: { node_id: 'go', port_id: 'data' } });
    expect(result(run, 'n')).toMatchObject({ status: 'success', outputs: { got: 'from a' } });
  });

  it('is computed in an event round when what computes it has a ◆ of its own', async () => {
    // `y` hangs on `r`, and `r` on `q`: the press ran `r` but not `q`, so
    // neither `r` nor `y` was ever opened.
    const graph = graphOf(
      [
        start('go'),
        node('x', 'code', { code: 'function run() { return { out: "from x" }; }' }, { in: ['p'], out: ['out'] }),
        node('q', 'code', { code: 'function run() { return { ok: true }; }' }, { out: ['ok'] }),
        node('r', 'code', { code: 'function run() { return { open: true }; }' }, { out: ['open'] }),
        node('y', 'code', { code: 'function run(i) { return { got: i.v }; }' }, { in: ['v'], out: ['got'] }),
      ],
      [
        edge('p', 'go', 'data', 'x', 'p'), edge('xy', 'x', 'out', 'y', 'v'),
        edge('ry', 'r', 'open', 'y', RUN_PORT), edge('qr', 'q', 'ok', 'r', RUN_PORT),
      ],
    );
    const run = await executeGraph(graph, { runtime, registry, latch: new Latch(), trigger: { node_id: 'go', port_id: 'data' } });
    expect(result(run, 'r')).toMatchObject({ status: 'success', outputs: { open: true } });
    expect(result(run, 'y')).toMatchObject({ status: 'success', outputs: { got: 'from x' } });
  });

  it('opens a gate with true and with nothing else', async () => {
    ran = [];
    const truthy = 'function run() { return { draw: "yes", refresh: 1 }; }';
    await executeGraph(routed(truthy), { runtime, registry, trigger: { node_id: 'go', port_id: 'data' }, latch: new Latch() });
    expect(ran).toEqual(['go', 'tick', 'router']);
  });

  it('stops the branch behind a shut gate: nothing new reached it', async () => {
    const latch = new Latch();
    await executeGraph(routed(ROUTER), { runtime, registry, trigger: { node_id: 'tick', port_id: 'data' }, latch });
    ran = [];
    const run = await executeGraph(routed(ROUTER), { runtime, registry, trigger: { node_id: 'go', port_id: 'data' }, latch });
    expect(ran).toEqual(['go', 'tick', 'router', 'chart']);
    expect(result(run, 'source')).toMatchObject({ held: true });
    expect(result(run, 'table')).toMatchObject({ held: true, outputs: { rows: [1] } });
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

describe('a node that keeps something of its own', () => {
  it('is remembered across rounds though settling changes its config', async () => {
    // reader (gated) -> data node -> summary, which a length choice starts as well.
    const latch = new Latch();
    const graph = graphOf(
      [
        start('read'),
        start('length', { length: 'short' }),
        node('reader', 'code', { code: 'function run() { return { text: "the file" }; }' }, { out: ['text'] }),
        node('keep', 'data', { data_value: '' }, { in: ['input'], out: ['output'] }),
        node('summary', 'code', { code: 'function run(i) { return { out: i.length + ": " + i.text }; }' }, { in: ['text', 'length:length'], out: ['out'] }),
      ],
      [
        edge('gate', 'read', 'data', 'reader', RUN_PORT),
        edge('a', 'reader', 'text', 'keep', 'input'),
        edge('b', 'keep', 'output', 'summary', 'text'),
        edge('c', 'length', 'data', 'summary', 'length'),
      ],
    );
    await executeGraph(graph, { runtime, registry, latch, trigger: READ });
    const second = await executeGraph(graph, { runtime, registry, latch, trigger: LENGTH });
    expect(result(second, 'reader')).toMatchObject({ held: true });
    expect(result(second, 'summary')).toMatchObject({ status: 'success', outputs: { out: 'short: the file' } });
  });

  it('runs when its own event began the round, whatever else stood still or had nothing to do', async () => {
    // "Read" has never been pressed: the reader has nothing to hand on, and
    // "ask" must still work.
    const graph = graphOf(
      [
        start('read'),
        start('ask', { q: 'a question' }),
        node('reader', 'code', { code: 'function run() { return { text: "the file" }; }' }, { out: ['text'] }),
        node('shown', 'end', {}, { in: ['value'] }),
        node('answer', 'code', { code: 'function run(i) { return { out: "answer to " + i.q }; }' }, { in: ['q:q'], out: ['out'] }),
      ],
      [
        edge('gate', 'read', 'data', 'reader', RUN_PORT),
        edge('show', 'reader', 'text', 'shown', 'value'),
        edge('q', 'ask', 'data', 'answer', 'q'),
        edge('go', 'ask', 'data', 'answer', RUN_PORT),
      ],
    );
    const asked = await executeGraph(graph, { runtime, registry, latch: new Latch(), trigger: { node_id: 'ask', port_id: 'data' } });
    expect(result(asked, 'ask')!.status).toBe('success');
    expect(result(asked, 'answer')).toMatchObject({ status: 'success', outputs: { out: 'answer to a question' } });
  });

  it('hands on what it kept when the node that updates it had nothing to do', async () => {
    const graph = graphOf(
      [
        start('read'),
        start('use'),
        node('reader', 'code', { code: 'function run() { return { text: "new" }; }' }, { out: ['text'] }),
        node('keep', 'data', { data_value: 'kept from yesterday' }, { in: ['input'], out: ['output'] }),
        node('user', 'code', { code: 'function run(i) { return { saw: i.x }; }' }, { in: ['x'], out: ['saw'] }),
      ],
      [
        edge('g1', 'read', 'data', 'reader', RUN_PORT),
        edge('a', 'reader', 'text', 'keep', 'input'),
        edge('b', 'keep', 'output', 'user', 'x'),
        edge('g2', 'use', 'data', 'user', RUN_PORT),
      ],
    );
    const run = await executeGraph(graph, { runtime, registry, latch: new Latch(), trigger: { node_id: 'use', port_id: 'data' } });
    expect(result(run, 'user')).toMatchObject({ status: 'success', outputs: { saw: 'kept from yesterday' } });
  });
});

describe('a result handed back from an earlier run', () => {
  it('is what a later round with a shut gate holds, not the value before it', async () => {
    // Made X, then Y, then X again -- reused this time -- and then the ◆ stays shut.
    const latch = new Latch();
    const reuse = new LastOutputs();
    const build = (value: string, open: boolean) => graphOf(
      [
        node('src', 'code', { code: `function run() { return { v: "${value}" }; }` }, { out: ['v'] }),
        node('flag', 'code', { code: `function run() { return { open: ${open} }; }` }, { out: ['open'] }),
        node('c', 'code', { code: 'function run(i) { return { out: i.x }; }' }, { in: ['x'], out: ['out'] }),
      ],
      [edge('s', 'src', 'v', 'c', 'x'), edge('g', 'flag', 'open', 'c', RUN_PORT)],
    );
    const only = new Set(['src', 'flag', 'c']);
    const round = (value: string, open: boolean) => executeGraph(build(value, open), { runtime, registry, latch, reuse, only });
    await round('X', true);
    await round('Y', true);
    expect(result(await round('X', true), 'c')!.messages?.[0]).toMatch(/Reused/);
    expect(result(await round('X', false), 'c')).toMatchObject({ held: true, outputs: { out: 'X' } });
  });
});

describe('what a node holds belongs to its own graph', () => {
  it('is never handed to another graph of the same name', async () => {
    // Two projects, both "Untitled Graph", with the same node `c`: the second
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

  it('is kept by a data node of another graph neither, whose settings are not part of the key', async () => {
    const latch = new Latch();
    const build = (other: string, open: boolean) => graphOf(
      [
        node('flag', 'code', { code: `function run() { return { open: ${open} }; }` }, { out: ['open'] }),
        node('keep', 'data', { data_value: 'mine' }, { in: ['input'], out: ['output'] }),
        node(other, 'code', {}, { in: ['v'], out: ['v'] }),
      ],
      [edge('g', 'flag', 'open', 'keep', RUN_PORT)],
    );
    await executeGraph(build('first', true), { runtime, registry, latch });
    const second = await executeGraph(build('second', false), { runtime, registry, latch });
    expect(result(second, 'keep')!.held).toBeUndefined();
  });
});

describe('an event is a moment', () => {
  it('is never handed back from an earlier round by the reuse cache', async () => {
    const latch = new Latch();
    const reuse = new LastOutputs();
    const graph = graphOf(
      [
        start('kind', { kind: 'a' }),
        start('ask'),
        node('router', 'code', { code: 'function run(i) { return { saw: !!i.ask.event }; }' }, { in: ['ask', 'kind:kind'], out: ['saw'] }),
      ],
      [
        edge('a', 'ask', 'data', 'router', 'ask'),
        edge('k', 'kind', 'data', 'router', 'kind'),
      ],
    );
    const pressed = await executeGraph(graph, { runtime, registry, latch, reuse, trigger: { node_id: 'ask', port_id: 'data' } });
    expect(result(pressed, 'router')?.outputs).toEqual({ saw: true });
    const chosen = await executeGraph(graph, { runtime, registry, latch, reuse, trigger: { node_id: 'kind', port_id: 'data' } });
    expect(result(chosen, 'router')?.outputs).toEqual({ saw: false });
  });
});

describe('a graph inside a node', () => {
  it('holds nothing: one item\'s last value is not the next one\'s', async () => {
    const latch = new Latch();
    // What the graph above sends decides whether the node in there opens: a
    // code node in there reads it, and opens the ◆ with what it read.
    const inner = graphOf(
      [
        node('open', 'start', { started_by: 'call' }),
        node('check', 'code', { code: 'function run(i) { return { open: i.flag }; }' }, { in: ['flag:open'], out: ['open'] }),
        node('made', 'code', { code: 'function run() { return { out: "made" }; }' }, { out: ['out'] }),
        node('result', 'end', {}, { in: ['value'] }),
      ],
      [
        edge('f', 'open', 'data', 'check', 'flag'),
        edge('g', 'check', 'open', 'made', RUN_PORT),
        edge('o', 'made', 'out', 'result', 'value'),
      ],
    );
    const outer = (open: boolean): Graph => graphOf(
      [
        node('flag', 'code', { code: `function run() { return { open: ${open} }; }` }, { out: ['open'] }),
        node('part', 'subgraph', { subgraph: inner }, { in: ['open'], out: ['result'] }),
      ],
      [edge('f', 'flag', 'open', 'part', 'open')],
    );
    const first = await executeGraph(outer(true), { runtime, registry, latch });
    expect(result(first, 'part')?.status).toBe('success');
    const second = await executeGraph(outer(false), { runtime, registry, latch });
    const inside = JSON.stringify(result(second, 'part'));
    expect(inside).not.toContain('"made"');
  });
});
