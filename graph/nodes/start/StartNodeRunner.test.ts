import { describe, it, expect } from 'vitest';
import type { Graph, GraphNode } from '../../graph.ts';
import type { Runtime } from '../Runtime.ts';
import { edge, graphOf, quietRuntime } from '../../test/fakes.ts';
import { registry } from '../registry.ts';
import { Session, type SessionOptions } from '../../../backend/gui-editor/session.ts';
import { START_PORT } from '../../execution/triggers.ts';

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
});
