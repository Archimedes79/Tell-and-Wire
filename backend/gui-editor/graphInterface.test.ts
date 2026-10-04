import { describe, it, expect } from 'vitest';
import { parseGraph, type ExecutionResult, type Graph } from '../../graph/graph.ts';
import { registry } from '../../graph/nodes/registry.ts';
import { executeGraph } from '../../graph/execution/executor.ts';
import { NotOffered, applySent, checkSent, eventOf, interfaceOf, outputsOf, sentOf } from './graphInterface.ts';
import { quietRuntime } from '../../graph/test/fakes.ts';

/**
 * A graph used from outside, by name: what any frontend, script or model
 * calls -- a start point, an end point, each by its own id -- and never a
 * port. There is one kind of way in and one of way out: nothing else of the
 * graph is set from outside. The page's blocks are not among the names: they
 * connect themselves to them.
 */

const input = (id: string, data_type: string, field?: string) =>
  ({ id, name: id.charAt(0).toUpperCase() + id.slice(1), kind: 'input', data_type, ...(field ? { field } : {}) });
const wire = (id: string, to: string) =>
  ({ id, source_node_id: 'api', source_port_id: 'data', target_node_id: 'write', target_port_id: to });

const tool = (): Graph => parseGraph({
  metadata: { name: 'tool' },
  nodes: [
    { id: 'ask', node_type: 'start', label: 'Ask', config: { started_by: 'page' } },
    { id: 'api', node_type: 'start', config: { started_by: 'call' } },
    { id: 'clock', node_type: 'start', config: { started_by: 'itself', every: '5m' } },
    { id: 'topic', node_type: 'data', label: 'Topic', config: { data_value: 'cats' } },
    {
      id: 'write', node_type: 'code', label: 'Write',
      inputs: [input('topic', 'text', 'topic'), input('size', 'number', 'options.size'), input('again', 'text', 'topic'), input('all', 'json')],
      config: { code: 'function run() { return {}; }' },
    },
    { id: 'answer', node_type: 'end', label: 'Answer', inputs: [{ id: 'value', name: 'value', kind: 'input', data_type: 'text' }] },
    { id: 'report', node_type: 'end', label: 'Report', inputs: [{ id: 'value', name: 'value', kind: 'input', data_type: 'text' }], config: { write_mode: 'file', path: 'out.md' } },
  ],
  edges: [wire('a', 'topic'), wire('b', 'size'), wire('c', 'again'), wire('d', 'all')],
  page: {
    blocks: [
      { id: 'title', kind: 'text', value: 'A tool' },
      { id: 'go', kind: 'button', label: 'Go', fires: 'ask' },
      { id: 'length', kind: 'select', label: 'Length', options: 'short\nlong', value: 'short', sends_to: ['ask'] },
      { id: 'talk', kind: 'chat', label: 'Talk', sends_to: ['ask'], fires: 'ask', shows: 'answer' },
      { id: 'plot', kind: 'plot_window', label: 'Plot', shows: 'answer' },
    ],
  },
});

const names = (entries: { name: string }[]) => entries.map((entry) => entry.name);

describe('what a graph offers', () => {
  it('names its start points and end points by their ids, with no port in sight -- and who starts each event', () => {
    const offered = interfaceOf(tool(), registry);
    expect(names(offered.events)).toEqual(['ask', 'api', 'clock']);
    expect(offered.events.map((entry) => entry.started_by)).toEqual(['page', 'call', 'itself']);
    expect(names(offered.outputs)).toEqual(['answer', 'report']);
    // Nothing else is set from outside: not what a data node holds, nor where an end point writes.
    expect(Object.keys(offered)).toEqual(['events', 'outputs']);
    expect(JSON.stringify(offered)).not.toMatch(/_out"|_in"|"node_id"|"port"/);
  });

  it('says what the graph reads of what a start point is sent: each part a node takes, once, typed as it takes it', () => {
    // What a caller sends for it to be used. An input that takes all of it
    // reads no one part, and says nothing here.
    const api = interfaceOf(tool(), registry).events[1];
    expect(api.reads).toEqual([
      { name: 'topic', label: 'Topic', type: 'text' },
      { name: 'options.size', label: 'Size', type: 'number' },
    ]);
  });

  it('says of a start point the page starts which blocks fire it and what the page sends with it', () => {
    const ask = interfaceOf(tool(), registry).events[0];
    expect(ask.fired_by).toEqual(['go', 'talk']);
    expect(ask.sends).toEqual([
      { name: 'length', label: 'Length', type: 'text', description: 'one of: short, long' },
      { name: 'talk', label: 'Talk', type: 'json', description: expect.stringContaining('"message"') },
    ]);
    // A start point a call starts is sent what the caller sends: the page says nothing of it.
    const { fired_by: fired, sends } = interfaceOf(tool(), registry).events[1];
    expect([fired, sends]).toEqual([undefined, undefined]);
  });

  it('offers no block: a block connects itself to the names, it is not one', () => {
    const offered = interfaceOf(tool(), registry);
    const all = [...names(offered.events), ...names(offered.outputs)];
    for (const block of ['title', 'go', 'length', 'talk', 'plot']) expect(all).not.toContain(block);
  });

  it('starts the round an event names -- none is the whole graph -- and refuses one it does not offer', () => {
    expect(eventOf(tool(), 'ask', registry)).toEqual({ node_id: 'ask', port_id: 'data' });
    expect(eventOf(tool(), 'clock', registry)).toEqual({ node_id: 'clock', port_id: 'data' });
    expect(eventOf(tool(), null, registry)).toBeNull();
    expect(() => eventOf(tool(), 'write', registry)).toThrow(NotOffered);
    expect(() => eventOf(tool(), 'go', registry)).toThrow(/No event called "go": this graph starts on "ask", "api", "clock"/);
  });
});

describe('what a round is sent', () => {
  it('goes to the start point it fires as one package, under whatever names the sender gave it', async () => {
    const graph = tool();
    const trigger = eventOf(graph, 'api', registry);
    expect(() => checkSent(graph, trigger, { anything: 1 }, registry)).not.toThrow();
    applySent(graph, trigger, { anything: 1 }, 'call', registry);
    const result = await executeGraph(graph, { runtime: quietRuntime(), registry, trigger });
    expect(result.node_results.find((one) => one.node_id === 'api')?.outputs).toEqual({
      data: { event: { name: 'api', by: 'call' }, values: { anything: 1 } },
    });
  });

  it('is nothing, for a round of the whole graph: no start point takes it -- and what is sent then is refused, all of it', () => {
    const graph = tool();
    expect(() => checkSent(graph, null, {}, registry)).not.toThrow();
    expect(() => checkSent(graph, null, { topic: 'dogs', length: 'long' }, registry))
      .toThrow(/A round of the whole graph is sent nothing: send "topic", "length" with an event -- this graph starts on "ask", "api", "clock"/);
    const closed = parseGraph({ nodes: [{ id: 'kept', node_type: 'data', config: { data_value: 'x' } }] });
    expect(() => checkSent(closed, null, { kept: 'y' }, registry)).toThrow(/it has no start point, so nothing from outside reaches it/);
  });
});

describe('what each start point was sent', () => {
  it('is, by its name, what the last round it began was sent -- its design\'s until then', () => {
    const graph = tool();
    expect(sentOf(graph, registry)).toEqual({ ask: {}, api: {}, clock: {} });
    applySent(graph, eventOf(graph, 'api', registry), { topic: 'dogs' }, 'call', registry);
    expect(sentOf(graph, registry)).toEqual({ ask: {}, api: { topic: 'dogs' }, clock: {} });
  });
});

describe('outputs by name', () => {
  it('are what arrived at each end point', () => {
    const result: ExecutionResult = {
      status: 'success', outputs: {},
      node_results: [
        { node_id: 'answer', status: 'success', inputs: { value: 'an answer' }, outputs: {} },
        { node_id: 'report', status: 'success', inputs: { value: 'the report' }, outputs: {} },
      ],
    };
    expect(outputsOf(tool(), result, registry)).toEqual({ answer: 'an answer', report: 'the report' });
  });

  it('leave out what the round did not reach', () => {
    const result: ExecutionResult = { status: 'success', outputs: {}, node_results: [{ node_id: 'report', status: 'success', inputs: { value: 'x' }, outputs: {} }] };
    expect(outputsOf(tool(), result, registry)).toEqual({ report: 'x' });
    expect(outputsOf(tool(), null, registry)).toEqual({});
  });
});
