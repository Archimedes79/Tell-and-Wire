import { describe, it, expect } from 'vitest';
import { type Graph, type GraphNode } from '../graph.ts';
import { executeGraph } from './executor.ts';
import { memoryReads } from './order.ts';
import type { Runtime } from '../nodes/Runtime.ts';
import { registry } from '../nodes/registry.ts';
import { RUN_PORT, pageStarts, startEvents, triggeredNodes } from './triggers.ts';
import { LastOutputs } from './reuse.ts';
import { edge, graphOf, quietRuntime } from '../test/fakes.ts';

/** A code node needs a body to be allowed to run; the fake runner ignores what it says. */
const BODY = { code: 'function run(inputs) { return inputs; }' };

/** A port, by name; `name:field` takes that one value of what arrives (`Port.field`). */
function port(spec: string, kind: 'input' | 'output') {
  const [name, field] = spec.split(':');
  return { id: name, name, kind, data_type: 'any' as const, multi: false, required: false, description: '', ...(field ? { field } : {}) };
}

function node(id: string, type = 'code', given: Record<string, unknown> = {}, ports: { in?: string[]; out?: string[] } = {}): GraphNode {
  return {
    id, node_type: type as GraphNode['node_type'], label: id, description: '',
    position: { x: 0, y: 0 },
    config: type === 'code' ? { ...BODY, ...given } : given,
    inputs: (ports.in ?? []).map((name) => port(name, 'input')),
    outputs: (ports.out ?? []).map((name) => port(name, 'output')),
  };
}

/** A start point the page starts, holding what the page sent it last. */
const start = (id: string, values: Record<string, unknown> = {}) => node(id, 'start', { started_by: 'page', values });

/**
 * Two buttons and a message box on a page: two tools in one window. Each
 * button fires a start point of its own, and the box sends to both.
 */
function twoTools(): Graph {
  return graphOf(
    [
      start('go_a', { msg: 'hello' }), start('go_b', { msg: 'hello' }),
      node('a', 'code', {}, { in: ['text:msg'], out: ['text'] }), node('b', 'code', {}, { in: ['text:msg'], out: ['text'] }),
      node('show_a', 'end', {}, { in: ['value'] }), node('show_b', 'end', {}, { in: ['value'] }),
    ],
    [
      edge('a_in', 'go_a', 'data', 'a', 'text'),
      edge('b_in', 'go_b', 'data', 'b', 'text'),
      edge('a_out', 'a', 'text', 'show_a', 'value'),
      edge('b_out', 'b', 'text', 'show_b', 'value'),
    ],
  );
}

const ran: string[] = [];
const runtime = quietRuntime({ report: (event) => { if (event.type === 'node_start') ran.push(event.node_id); } });

describe('a round started at a start point', () => {
  it('runs what the start point is wired to and what that needs, and leaves the other tool alone; with no event named, everything; the ◆ opens a node and delivers nothing', async () => {
    const graph = twoTools();
    expect([...triggeredNodes(graph, { node_id: 'go_a', port_id: 'data' }, registry)!].sort()).toEqual(['a', 'go_a', 'show_a']);

    ran.length = 0;
    const result = await executeGraph(twoTools(), { runtime, registry, trigger: { node_id: 'go_a', port_id: 'data' } });
    expect(ran.sort()).toEqual(['a', 'go_a', 'show_a']);
    expect(result.status).toBe('success');
    // The first node is handed the one value its port takes of the package.
    expect(result.node_results.find((r) => r.node_id === 'a')!.inputs).toEqual({ text: 'hello' });
    expect(result.node_results.find((r) => r.node_id === 'show_a')!.inputs).toEqual({ value: 'hello' });

    ran.length = 0;
    await executeGraph(twoTools(), { runtime, registry });
    expect(ran.sort()).toEqual(['a', 'b', 'go_a', 'go_b', 'show_a', 'show_b']);

    // A tool that counts: the click runs the step, the memory fills and forwards, and what shows it runs in the same round.
    const counting = graphOf(
      [start('click'), node('step', 'code', {}, { in: ['n'], out: ['next'] }), node('count', 'data', { data_value: { n: 0 } }, { in: ['n'], out: ['n'] }), node('show', 'end', {}, { in: ['value'] })],
      [edge('go', 'click', 'data', 'step', RUN_PORT), edge('read', 'count', 'n', 'step', 'n'), edge('write', 'step', 'next', 'count', 'n'), edge('see', 'count', 'n', 'show', 'value')],
    );
    expect([...memoryReads(counting.nodes, counting.edges, registry)]).toEqual(['read']);
    expect([...triggeredNodes(counting, { node_id: 'click', port_id: 'data' }, registry)!].sort()).toEqual(['click', 'count', 'show', 'step']);
    // The click may as well open the memory's own ◆: what reads the memory is for the event, and so is what shows what that makes.
    const gating = graphOf(counting.nodes, [edge('go', 'click', 'data', 'count', RUN_PORT), edge('read', 'count', 'n', 'step', 'n'), edge('write', 'step', 'next', 'count', 'n'), edge('see', 'step', 'next', 'show', 'value')]);
    expect([...triggeredNodes(gating, { node_id: 'click', port_id: 'data' }, registry)!].sort()).toEqual(['click', 'count', 'show', 'step']);

    // A round that starts somewhere else only reads the memory: it does not run what writes it.
    const peeking = graphOf(
      [...counting.nodes, start('peek'), node('look', 'end', {}, { in: ['a', 'b'] })],
      [...counting.edges, edge('pk', 'peek', 'data', 'look', 'a'), edge('lk', 'count', 'n', 'look', 'b')],
    );
    expect([...triggeredNodes(peeking, { node_id: 'peek', port_id: 'data' }, registry)!].sort()).toEqual(['count', 'look', 'peek']);

    // The ◆ delivers nothing: it says when, not what.
    const gated = graphOf(
      [start('go', { msg: 'hi' }), node('a', 'code', {}, { in: ['text:msg'], out: ['text'] }), node('b', 'code', {}, { out: ['o'] })],
      [edge('in', 'go', 'data', 'a', 'text'), edge('when', 'go', 'data', 'b', RUN_PORT)],
    );
    const opened = await executeGraph(gated, { runtime, registry, trigger: { node_id: 'go', port_id: 'data' } });
    expect(opened.node_results.find((r) => r.node_id === 'b')).toMatchObject({ status: 'success', inputs: {} });
  });
});

describe('starting the application', () => {
  it('waits for its page or for a call where a start point is started by one; runs whole once with no start point; starts only those set to start', () => {
    const paged = graphOf([start('go'), node('a')], []);
    expect(pageStarts(paged, registry)).toBe(true);
    expect(startEvents(paged, registry)).toEqual([]);

    const called = graphOf([node('api', 'start', { started_by: 'call' }), node('a')], []);
    expect(pageStarts(called, registry)).toBe(false);
    expect(startEvents(called, registry)).toEqual([]);

    expect(startEvents(graphOf([node('a')], []), registry)).toEqual([null]);

    const clocks = graphOf([
      node('clock', 'start', { started_by: 'itself', on_start: false, every: '5m' }),
      node('start', 'start', { started_by: 'itself' }),
      start('go'),
    ], []);
    expect(startEvents(clocks, registry)).toEqual([{ node_id: 'start', port_id: 'data' }]);
  });
});

describe('reusing context', () => {
  /**
   * A message goes through an expensive step; a length choice only shapes
   * what comes after it. Choosing a length fires a start point of its own,
   * and the message reaches the model through the start point it was sent.
   */
  function modelThenShape(message: string): Graph {
    return graphOf(
      [
        start('ask', { msg: message }),
        start('choose', { len: 'short' }),
        node('model', 'code', { code: 'function run(inputs) { /* model */ return inputs; }' }, { in: ['text:msg'], out: ['text'] }),
        node('shape', 'code', {}, { in: ['text', 'len:len'], out: ['text'] }),
        node('show', 'end', {}, { in: ['value'] }),
      ],
      [
        edge('m', 'ask', 'data', 'model', 'text'),
        edge('t', 'model', 'text', 'shape', 'text'),
        edge('l', 'choose', 'data', 'shape', 'len'),
        edge('s', 'shape', 'text', 'show', 'value'),
      ],
    );
  }

  let asked = 0;
  const counting: Runtime = {
    ...runtime,
    code: { run: async (body, inputs) => { if (body.includes('model')) asked += 1; return inputs; } },
  };
  const choose = { node_id: 'choose', port_id: 'data' };

  it('does not run what an event only needs again while nothing it depends on changed; runs it when an input changed; never in a whole-graph run', async () => {
    const reuse = new LastOutputs();
    asked = 0;
    await executeGraph(modelThenShape('hello'), { runtime: counting, registry, trigger: choose, reuse });
    const second = await executeGraph(modelThenShape('hello'), { runtime: counting, registry, trigger: choose, reuse });
    expect(asked).toBe(1);
    expect(second.node_results.find((r) => r.node_id === 'model')?.messages?.[0]).toMatch(/Reused/);
    // What the event is for ran, and got the reused value.
    expect(second.node_results.find((r) => r.node_id === 'shape')?.outputs).toMatchObject({ text: 'hello', len: 'short' });

    await executeGraph(modelThenShape('goodbye'), { runtime: counting, registry, trigger: choose, reuse });
    expect(asked).toBe(2);

    // A whole-graph run asks again, and so does a round with nowhere to keep results.
    await executeGraph(modelThenShape('goodbye'), { runtime: counting, registry, reuse });
    await executeGraph(modelThenShape('goodbye'), { runtime: counting, registry, trigger: choose });
    expect(asked).toBe(4);
  });
});
