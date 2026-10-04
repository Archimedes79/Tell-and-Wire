import { describe, it, expect } from 'vitest';
import { type Graph, type GraphNode } from '../graph.ts';
import { executeGraph, memoryFeedbackEdges } from './executor.ts';
import type { Runtime } from '../elements/Runtime.ts';
import { registry } from '../elements/registry.ts';
import { RUN_PORT, graphTriggers, pageStarts, startEvents, triggeredNodes } from './triggers.ts';
import { LastOutputs } from './reuse.ts';
import { edge, graphOf, quietRuntime } from '../../test/fakes.ts';

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

describe('triggeredNodes', () => {
  it('runs what the start point is wired to, and what that needs', () => {
    const graph = twoTools();
    const feedback = memoryFeedbackEdges(graph.nodes, graph.edges, registry);
    const only = triggeredNodes(graph, { node_id: 'go_a', port_id: 'data' }, feedback);
    expect([...only!].sort()).toEqual(['a', 'go_a', 'show_a']);
  });

  it('means everything when the start point is wired to nothing', () => {
    const graph = twoTools();
    graph.edges = graph.edges.filter((e) => e.id !== 'a_in');
    const feedback = memoryFeedbackEdges(graph.nodes, graph.edges, registry);
    expect(triggeredNodes(graph, { node_id: 'go_a', port_id: 'data' }, feedback)).toBeNull();
  });

  it('follows the wires downstream of where it starts', () => {
    const graph = graphOf(
      [start('go'), node('a'), node('b'), node('other')],
      [edge('r', 'go', 'data', 'a', RUN_PORT), edge('ab', 'a', 'o', 'b', 'i')],
    );
    const only = triggeredNodes(graph, { node_id: 'go', port_id: 'data' }, new Set());
    expect([...only!].sort()).toEqual(['a', 'b', 'go']);
  });

  it('does not drag in a node just because it can also start one that runs', () => {
    // `timer` may start `b` too, but this event is not the timer's.
    const graph = graphOf(
      [start('go'), node('timer'), node('b')],
      [edge('r', 'go', 'data', 'b', RUN_PORT), edge('t', 'timer', 'o', 'b', RUN_PORT)],
    );
    const only = triggeredNodes(graph, { node_id: 'go', port_id: 'data' }, new Set());
    expect([...only!].sort()).toEqual(['b', 'go']);
  });
});

describe('a round started at a start point', () => {
  it('runs one tool and leaves the other alone', async () => {
    ran.length = 0;
    const result = await executeGraph(twoTools(), { runtime, registry, trigger: { node_id: 'go_a', port_id: 'data' } });
    expect(ran.sort()).toEqual(['a', 'go_a', 'show_a']);
    expect(result.status).toBe('success');
    expect(result.node_results.map((r) => r.node_id).sort()).toEqual(['a', 'go_a', 'show_a']);
    // The answer reaches its end point; the other end point was not touched.
    expect(result.node_results.find((r) => r.node_id === 'show_a')!.inputs).toEqual({ value: 'hello' });
  });

  it('hands the first node the one value its port takes of the package', async () => {
    const result = await executeGraph(twoTools(), { runtime, registry, trigger: { node_id: 'go_a', port_id: 'data' } });
    expect(result.node_results.find((r) => r.node_id === 'a')!.inputs).toEqual({ text: 'hello' });
  });

  it('opens a node its package is wired into the ◆ of, and delivers nothing there: it says when, not what', async () => {
    const graph = graphOf(
      [start('go', { msg: 'hi' }), node('a', 'code', {}, { in: ['text:msg'], out: ['text'] }), node('b', 'code', {}, { out: ['o'] })],
      [edge('in', 'go', 'data', 'a', 'text'), edge('when', 'go', 'data', 'b', RUN_PORT)],
    );
    const result = await executeGraph(graph, { runtime, registry, trigger: { node_id: 'go', port_id: 'data' } });
    expect(result.node_results.find((r) => r.node_id === 'b')).toMatchObject({ status: 'success', inputs: {} });
  });

  it('runs everything when no event is named', async () => {
    ran.length = 0;
    await executeGraph(twoTools(), { runtime, registry });
    expect(ran.sort()).toEqual(['a', 'b', 'go_a', 'go_b', 'show_a', 'show_b']);
  });
});

describe('graphTriggers', () => {
  it('is nothing unless the graph holds a start point that starts itself', () => {
    expect(graphTriggers(graphOf([], []))).toEqual([]);
    expect(graphTriggers(graphOf([start('go')], []))).toEqual([]);
  });

  it('reads each start point that starts itself as the event it is, and when it starts', () => {
    const graph = graphOf([
      node('clock', 'start', { started_by: 'itself', on_start: false, every: ' 5m ' }),
      node('start', 'start', { started_by: 'itself' }),
    ], []);
    expect(graphTriggers(graph)).toEqual([
      { event: { node_id: 'clock', port_id: 'data' }, on_start: false, every: '5m' },
      { event: { node_id: 'start', port_id: 'data' }, on_start: true, every: '' },
    ]);
  });
});

describe('starting the application', () => {
  it('waits for its page where a start point is started by the page', () => {
    const paged = graphOf([start('go'), node('a')], []);
    expect(pageStarts(paged, registry)).toBe(true);
    expect(startEvents(paged, registry)).toEqual([]);
  });

  it('waits for a call where a start point is started by one: a tool served to a script runs when it is asked', () => {
    const called = graphOf([node('api', 'start', { started_by: 'call' }), node('a')], []);
    expect(pageStarts(called, registry)).toBe(false);
    expect(startEvents(called, registry)).toEqual([]);
  });

  it('runs whole once where nobody would ever start it: no start point at all', () => {
    expect(startEvents(graphOf([node('a')], []), registry)).toEqual([null]);
  });

  it('starts the start points set to start when the tool starts, and only those, where the graph has any', () => {
    const graph = graphOf([
      node('clock', 'start', { started_by: 'itself', on_start: false, every: '5m' }),
      node('start', 'start', { started_by: 'itself' }),
      start('go'),
    ], []);
    expect(startEvents(graph, registry)).toEqual([{ node_id: 'start', port_id: 'data' }]);
    // A start point that starts itself does not make the page start anything.
    expect(pageStarts(graphOf([node('start', 'start', { started_by: 'itself' })], []), registry)).toBe(false);
  });
});

describe('a start point that starts itself', () => {
  /** A clock wired to one of two tools: a round it starts runs that one. */
  const clocked = (): Graph => graphOf(
    [node('clock', 'start', { started_by: 'itself', every: '5m' }, { out: ['data'] }), node('a', 'code', {}, { out: ['o'] }), node('b', 'code', {}, { out: ['o'] })],
    [edge('t', 'clock', 'data', 'a', RUN_PORT)],
  );

  it('starts what it is wired to, and says in its package that the round began there, by itself', async () => {
    ran.length = 0;
    const result = await executeGraph(clocked(), { runtime, registry, trigger: { node_id: 'clock', port_id: 'data' } });
    expect(ran.sort()).toEqual(['a', 'clock']);
    expect(result.node_results.find((r) => r.node_id === 'clock')!.outputs).toEqual({ data: { event: { name: 'clock', by: 'itself' }, values: {} } });
  });

  it('counts as started in a run nobody started, like every event', async () => {
    ran.length = 0;
    await executeGraph(clocked(), { runtime, registry });
    expect(ran.sort()).toEqual(['a', 'b', 'clock']);
  });

  it('is told when it could never start, or names an interval nobody can read', () => {
    const element = registry.node('start')!;
    expect(element.problems(node('t', 'start', { started_by: 'itself', on_start: false }), registry, 't')[0].problem).toMatch(/never starts/);
    expect(element.problems(node('t', 'start', { started_by: 'itself', every: 'soon' }), registry, 't')[0].problem).toMatch(/Not an interval/);
    expect(element.problems(node('t', 'start', { started_by: 'itself', every: '5m' }), registry, 't')).toEqual([]);
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

  it('does not run what an event only needs again when nothing it depends on changed', async () => {
    const reuse = new LastOutputs();
    asked = 0;
    await executeGraph(modelThenShape('hello'), { runtime: counting, registry, trigger: choose, reuse });
    const second = await executeGraph(modelThenShape('hello'), { runtime: counting, registry, trigger: choose, reuse });
    expect(asked).toBe(1);
    expect(second.node_results.find((r) => r.node_id === 'model')?.messages?.[0]).toMatch(/Reused/);
    // What the event is for ran, and got the reused value.
    expect(second.node_results.find((r) => r.node_id === 'shape')?.outputs).toMatchObject({ text: 'hello', len: 'short' });
  });

  it('runs it again when its input changed', async () => {
    const reuse = new LastOutputs();
    asked = 0;
    await executeGraph(modelThenShape('hello'), { runtime: counting, registry, trigger: choose, reuse });
    await executeGraph(modelThenShape('goodbye'), { runtime: counting, registry, trigger: choose, reuse });
    expect(asked).toBe(2);
  });

  it('never reuses in a whole-graph run, or without somewhere to keep results', async () => {
    const reuse = new LastOutputs();
    asked = 0;
    await executeGraph(modelThenShape('hello'), { runtime: counting, registry, reuse });
    await executeGraph(modelThenShape('hello'), { runtime: counting, registry, reuse });
    await executeGraph(modelThenShape('hello'), { runtime: counting, registry, trigger: choose });
    await executeGraph(modelThenShape('hello'), { runtime: counting, registry, trigger: choose });
    expect(asked).toBe(4);
  });
});
