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

describe('a graph used from outside', () => {
  it('offers its start points and end points by their ids -- with what each reads and what the page sends -- and no port', () => {
    const offered = interfaceOf(tool(), registry);
    expect(names(offered.events)).toEqual(['ask', 'api', 'clock']);
    expect(offered.events.map((entry) => entry.started_by)).toEqual(['page', 'call', 'itself']);
    expect(names(offered.outputs)).toEqual(['answer', 'report']);
    expect(JSON.stringify(offered)).not.toMatch(/_out"|_in"|"node_id"|"port"/);
    const [ask, api] = offered.events;
    // What a caller sends for it to be used: each part a node takes, once, typed as it takes it.
    expect(api.reads).toEqual([
      { name: 'topic', label: 'Topic', type: 'text' },
      { name: 'options.size', label: 'Size', type: 'number' },
    ]);
    // A start point the page starts: which blocks fire it, and what the page sends with it.
    expect(ask.fired_by).toEqual(['go', 'talk']);
    expect(ask.sends).toEqual([
      { name: 'length', label: 'Length', type: 'text', description: 'one of: short, long' },
      { name: 'talk', label: 'Talk', type: 'json', description: expect.stringContaining('"message"') },
    ]);
    expect([api.fired_by, api.sends]).toEqual([undefined, undefined]);
  });

  it('starts the round an event names -- none is the whole graph, sent nothing -- and refuses what it does not offer', () => {
    expect(eventOf(tool(), 'ask', registry)).toEqual({ node_id: 'ask', port_id: 'data' });
    expect(eventOf(tool(), null, registry)).toBeNull();
    expect(() => eventOf(tool(), 'write', registry)).toThrow(NotOffered);
    expect(() => eventOf(tool(), 'go', registry)).toThrow(/No event called "go": this graph starts on "ask", "api", "clock"/);
    expect(() => checkSent(tool(), null, {}, registry)).not.toThrow();
    expect(() => checkSent(tool(), null, { topic: 'dogs' }, registry)).toThrow(/A round of the whole graph is sent nothing/);
  });

  it('sends what a round is sent to the start point it fires as one package, and hands back the outputs by name', async () => {
    const graph = tool();
    const trigger = eventOf(graph, 'api', registry);
    expect(sentOf(graph, registry)).toEqual({ ask: {}, api: {}, clock: {} });
    applySent(graph, trigger, { anything: 1 }, 'call', registry);
    expect(sentOf(graph, registry)).toEqual({ ask: {}, api: { anything: 1 }, clock: {} });
    const result = await executeGraph(graph, { runtime: quietRuntime(), registry, trigger });
    expect(result.node_results.find((one) => one.node_id === 'api')?.outputs).toEqual({
      data: { event: { name: 'api', by: 'call' }, values: { anything: 1 } },
    });

    const reached: ExecutionResult = {
      status: 'success', outputs: {},
      node_results: [{ node_id: 'report', status: 'success', inputs: { value: 'the report' }, outputs: {} }],
    };
    expect(outputsOf(graph, reached, registry)).toEqual({ report: 'the report' });
    expect(outputsOf(graph, null, registry)).toEqual({});
  });
});
