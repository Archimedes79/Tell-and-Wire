import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Graph, GraphNode } from '../../../graph/graph.ts';
import type { Runtime } from '../../../graph/nodes/Runtime.ts';
import { registry } from '../../../graph/nodes/registry.ts';
import { Session } from '../../gui-editor/session.ts';
import { edge, graphOf, quietRuntime } from '../../../graph/test/fakes.ts';
import { keptRound, replayRound, writeKeptRound } from './keptRounds.ts';
import { localCore } from '../../../graph/core/localCore.ts';

/**
 * A round kept as a test, and run again: what came from outside or from
 * before is handed in, everything else runs, and the end points must hand
 * back what they did -- with no model asked.
 */

const port = (id: string, kind: 'input' | 'output', field?: string) =>
  ({ id, name: id, kind, data_type: 'any' as const, multi: false, required: false, description: '', ...(field ? { field } : {}) });

function node(id: string, type: string, config: Record<string, unknown> = {}, ports: { in?: string[]; out?: string[] } = {}): GraphNode {
  return {
    id, node_type: type as GraphNode['node_type'], label: id, description: `The ${id}.`, position: { x: 0, y: 0 }, config,
    inputs: (ports.in ?? []).map((spec) => port(spec.split(':')[0], 'input', spec.split(':')[1])),
    outputs: (ports.out ?? []).map((name) => port(name, 'output')),
  };
}

/** A start point a call starts, a model that answers, a code node that counts the answer's words, an end point. */
function asker(count = 'function run(i) { return { n: String(i.text).split(" ").length }; }'): Graph {
  return graphOf([
    node('ask', 'start', { started_by: 'call' }),
    node('answer', 'ai', { prompt: 'Answer.' }, { in: ['question:question'], out: ['output'] }),
    node('count', 'code', { code: count }, { in: ['text'], out: ['n'] }),
    node('words', 'end', {}, { in: ['value'] }),
  ], [
    edge('q', 'ask', 'data', 'answer', 'question'),
    edge('a', 'answer', 'output', 'count', 'text'),
    edge('n', 'count', 'n', 'words', 'value'),
  ]);
}

const inProcess: Runtime['code'] = {
  run: async (body, inputs) => new Function('inputs', `${body}; return run(inputs);`)(inputs) as Record<string, unknown>,
};
/** A model that answers with three words, every time. */
const answering = quietRuntime({ code: inProcess, ai: { complete: async () => 'three short words' } });

/** A round of *graph*, run in a session as a call, kept. */
async function keptOf(graph: Graph) {
  const session = await Session.open(graph, { runtime: () => answering });
  const { id, outcome } = session.start({ node_id: 'ask', port_id: 'data' }, { values: { question: 'How long?' } });
  const result = await outcome;
  return keptRound(graph, result, session.snapshot(id)!.started, registry);
}

describe('a round, kept', () => {
  it('hands in what came from outside or from before and keeps what came back; run again it asks no model, and fails saying what differs', async () => {
    const kept = await keptOf(asker());
    expect(kept.event).toBe('ask');
    expect(kept.by).toBe('call');
    expect(Object.keys(kept.given).sort()).toEqual(['answer', 'ask']);
    expect(kept.given.answer).toEqual({ output: 'three short words' });
    expect(kept.outputs).toEqual({ words: 3 });

    const noModel = quietRuntime({ code: inProcess, ai: { complete: async () => { throw new Error('asked a model'); } } });
    expect(await replayRound(asker(), kept, { core: localCore({ runtime: () => noModel }), registry })).toEqual({ status: 'pass', details: [], outputs: { words: 3 } });

    const changed = asker('function run(i) { return { n: String(i.text).length }; }');
    const replayed = await replayRound(changed, kept, { core: localCore({ runtime: () => noModel }), registry });
    expect(replayed.status).toBe('fail');
    expect(replayed.details).toEqual(['"words" handed back 17; the kept round, 3.']);

    // A tool that counts: its memory starts where it stood, and runs again -- the loop reads it as it did.
    const counter = (): Graph => graphOf([
      node('ask', 'start', { started_by: 'call' }),
      node('count', 'data', { data_value: { total: 0 } }, { in: ['total'], out: ['total'] }),
      node('step', 'code', { code: 'function run(i) { return { next: i.n + 1 }; }' }, { in: ['n:total', 'go'], out: ['next'] }),
      node('shown', 'end', {}, { in: ['value'] }),
    ], [
      edge('g', 'ask', 'data', 'step', 'go'), edge('r', 'count', 'before', 'step', 'n'),
      edge('w', 'step', 'next', 'count', 'total'), edge('s', 'count', 'total', 'shown', 'value'),
    ]);
    const session = await Session.open(counter(), { runtime: () => answering });
    await session.run({ node_id: 'ask', port_id: 'data' });
    const second = session.start({ node_id: 'ask', port_id: 'data' });
    const kept2 = keptRound(counter(), await second.outcome, session.snapshot(second.id)!.started, registry, session.stateBefore(second.id));
    expect(kept2.state).toEqual({ count: { total: 1, round: 1 } });
    expect(kept2.outputs).toEqual({ shown: 2 });
    expect(Object.keys(kept2.given)).toEqual(['ask']);
    expect(await replayRound(counter(), kept2, { core: localCore({ runtime: () => noModel }), registry })).toMatchObject({ status: 'pass', outputs: { shown: 2 } });
  });

  it('is kept under a file name of its own folder, whatever its start point is called', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'kept-'));
    const name = await writeKeptRound(folder, { event: '../..\\up: a/b', given: {}, outputs: {} });
    expect(name).not.toMatch(/[\\/:]/);
    expect(existsSync(join(folder, 'tests', `${name}.json`))).toBe(true);
  });
});
