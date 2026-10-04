import { describe, it, expect } from 'vitest';
import type { Graph, GraphNode } from '../../../graph.ts';
import type { Runtime } from '../../Runtime.ts';
import { edge, graphOf, quietRuntime } from '../../../../test/fakes.ts';
import { registry } from '../../registry.ts';
import { Session, type SessionOptions } from '../../../host/session.ts';
import { executeGraph } from '../../../execution/executor.ts';
import { interfaceOf } from '../../../execution/graphInterface.ts';
import { START_PORT, startEvents } from '../../../execution/triggers.ts';

/**
 * Where a round begins: a start point hands on one package -- the event, and
 * what the sender sent under the sender's own names -- and the first node it
 * reaches reads out of it what it needs.
 */

function node(id: string, type: string, config: Record<string, unknown> = {}, ports: { in?: string[]; out?: string[] } = {}): GraphNode {
  const port = (name: string, kind: 'input' | 'output') => ({
    id: name, name, kind, data_type: 'any' as const, multi: false, required: false, description: '',
  });
  const outputs = type === 'start' ? registry.node('start')!.derivedPorts(undefined as never, registry)!.outputs : (ports.out ?? []).map((name) => port(name, 'output'));
  return {
    id, node_type: type as GraphNode['node_type'], label: id, description: '', position: { x: 0, y: 0 },
    config, inputs: (ports.in ?? []).map((name) => port(name, 'input')), outputs,
  };
}

/** A code node whose body is *run*, run in this process. */
const code = (id: string, run: string, ports: { in: string[]; out: string[] }) => node(id, 'code', { code: run }, ports);

const inProcess: Runtime['code'] = {
  run: async (body, inputs) => new Function('inputs', `${body}; return run(inputs);`)(inputs) as Record<string, unknown>,
};
const runtime = quietRuntime({ code: inProcess });
const fake: SessionOptions['runtime'] = (report) => quietRuntime({ code: inProcess, report });

/** A page's "Ask": a start point, a code node that reads the package, and the end point it hands its answer to. */
function asking(): Graph {
  return graphOf(
    [
      node('ask', 'start', { started_by: 'page' }),
      code('answer', 'function run(i) { const { event, values } = i.request; return { text: (event ? event.name + "/" + event.by : "none") + ": " + values.question }; }',
        { in: ['request'], out: ['text'] }),
      node('shown', 'end', {}, { in: ['value'] }),
    ],
    [edge('a', 'ask', START_PORT, 'answer', 'request'), edge('b', 'answer', 'text', 'shown', 'value')],
  );
}

const arrived = (result: { node_results: { node_id: string; inputs: Record<string, unknown> }[] }, id: string) =>
  result.node_results.find((one) => one.node_id === id)?.inputs;

describe('a start point', () => {
  it('hands on one package: the event the round began with, and what was sent, under the sender\'s names', async () => {
    const session = await Session.open(asking(), { runtime: fake });
    // Names the graph declares nowhere: the sender's own, refused by nobody.
    const result = await session.run({ node_id: 'ask', port_id: START_PORT }, { values: { question: 'Why?', folder: 'D:/papers' }, by: 'ask_button' });
    expect(result.status).toBe('success');
    expect(arrived(result, 'answer')).toEqual({
      request: { event: { name: 'ask', by: 'ask_button' }, values: { question: 'Why?', folder: 'D:/papers' } },
    });
    expect(arrived(result, 'shown')).toEqual({ value: 'ask/ask_button: Why?' });
  });

  it('keeps what it was sent last, and a round it did not begin finds it there, with no event', async () => {
    const graph = graphOf(
      [
        node('ask', 'start', { started_by: 'page' }),
        node('refresh', 'start', { started_by: 'call' }),
        code('both', 'function run(i) { return { said: (i.a.event ? "ask" : "-") + "," + (i.r.event ? "refresh" : "-") + ":" + i.a.values.question }; }',
          { in: ['a', 'r'], out: ['said'] }),
      ],
      [edge('a', 'ask', START_PORT, 'both', 'a'), edge('r', 'refresh', START_PORT, 'both', 'r')],
    );
    const session = await Session.open(graph, { runtime: fake });
    await session.run({ node_id: 'ask', port_id: START_PORT }, { values: { question: 'first' }, by: 'ask_button' });
    expect(session.kept().nodes).toEqual({ ask: { values: { question: 'first' } } });
    const later = await session.run({ node_id: 'refresh', port_id: START_PORT }, {});
    expect(later.node_results.find((one) => one.node_id === 'both')?.outputs).toEqual({ said: '-,refresh:first' });
  });

  it('is offered under its own name, with who starts it, and as nothing but an event', () => {
    const offered = interfaceOf(asking(), registry);
    expect(offered.events.map(({ name, label, type, started_by }) => ({ name, label, type, started_by })))
      .toEqual([{ name: 'ask', label: 'ask', type: 'json', started_by: 'page' }]);
    expect(offered.outputs.map((entry) => entry.name)).toEqual(['shown']);
  });

  it('started by the page, waits for the page; started by itself when the tool starts, starts', () => {
    expect(startEvents(asking(), registry)).toEqual([]);
    const itself = graphOf([node('morning', 'start', { started_by: 'itself', on_start: true })], []);
    expect(startEvents(itself, registry)).toEqual([{ node_id: 'morning', port_id: START_PORT }]);
  });

  it('is a port of the node that holds its graph: what the graph above hands down is the package\'s values, under its name', async () => {
    const inner = graphOf(
      [
        node('text', 'start', { started_by: 'call' }),
        code('count', 'function run(i) { return { n: String(i.request.values.text).split(" ").length, by: i.request.event.by }; }',
          { in: ['request'], out: ['n', 'by'] }),
        node('words', 'end', {}, { in: ['value'] }),
      ],
      [edge('a', 'text', START_PORT, 'count', 'request'), edge('b', 'count', 'n', 'words', 'value')],
    );
    const holder: GraphNode = { ...node('part', 'subgraph', { subgraph: inner }), inputs: [], outputs: [] };
    const ports = registry.node('subgraph')!.derivedPorts(holder, registry)!;
    expect(ports.inputs.map((port) => port.id)).toEqual(['text']);
    expect(ports.outputs.map((port) => port.id)).toEqual(['words']);
    const outer = graphOf(
      [
        node('said', 'data', { data_format: 'text', data_value: 'three short words' }, { in: ['input'], out: ['output'] }),
        { ...holder, ...ports },
        node('shown', 'end', {}, { in: ['value'] }),
      ],
      [edge('a', 'said', 'output', 'part', 'text'), edge('b', 'part', 'words', 'shown', 'value')],
    );
    const result = await executeGraph(outer, { runtime, registry });
    expect(result.status).toBe('success');
    expect(arrived(result, 'shown')).toEqual({ value: 3 });
  });

  it('says when it starts itself and never would, or names a clock nobody can read', () => {
    const element = registry.node('start')!;
    expect(element.problems(node('s', 'start', { started_by: 'itself', on_start: false }), registry, 's')[0].problem).toMatch(/never starts/);
    expect(element.problems(node('s', 'start', { started_by: 'itself', every: 'soon' }), registry, 's')[0].problem).toMatch(/Not an interval/);
    // Started by the page or a call, a clock is no setting of it.
    expect(element.problems(node('s', 'start', { started_by: 'page', every: 'soon' }), registry, 's')).toEqual([]);
  });
});
