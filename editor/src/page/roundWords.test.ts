import { describe, it, expect } from 'vitest';
import type { RoundSnapshot } from '@/api/client';
import { roundExplained } from './roundWords';

/** A round that explains itself: what began it, how its nodes went, and why each that did not run did not. */
describe('a round, explained', () => {
  const round = (over: Partial<RoundSnapshot>): RoundSnapshot => ({
    round_id: 'r', done: true, cancelled: false, completed: 2, total: 4, current_label: '', item_done: 0, item_total: 0,
    idle_seconds: null, error: null, outputs: {}, started: { event: 'send', by: 'chat' },
    result: {
      status: 'partial', outputs: {},
      node_results: [
        { node_id: 'read', status: 'success', inputs: {}, outputs: {} },
        { node_id: 'plot', status: 'skipped', inputs: {}, outputs: { svg: 'x' }, held: true, messages: ['Nothing opened its ◆ this round. What it produced last stands.'] },
        { node_id: 'ask', status: 'error', inputs: {}, outputs: {}, error: 'The model said no.' },
        { node_id: 'say', status: 'skipped', inputs: {}, outputs: {}, messages: ['AI node "ask" failed before it, so it could not run.'] },
      ],
    },
    ...over,
  });

  it('says what began it and how many of its nodes ran, stood still, had nothing to do or failed', () => {
    expect(roundExplained(round({}))?.line).toBe('Last round: "send", from "chat" -- 1 ran, 1 stood still, 1 had nothing to do, 1 failed');
    // By the names a person gave them, not by id: the summarizer said "start", from block "button".
    const names: Record<string, string> = { send: 'Send', chat: 'Ask a question' };
    expect(roundExplained(round({}), (id) => names[id] ?? id)?.line).toMatch(/^Last round: "Send", from "Ask a question" --/);
    expect(roundExplained(round({ started: { event: 'measure', by: 'call' } }))?.line).toMatch(/^Last round: "measure", called --/);
    expect(roundExplained(round({ started: null }))?.line).toMatch(/^Last round: the whole graph --/);
  });

  it('says, for each node that did not run, why -- by the name a person knows it by', () => {
    const names: Record<string, string> = { plot: 'Plot', ask: 'Ask', say: 'Say it' };
    expect(roundExplained(round({}), (id) => names[id] ?? id)?.why).toEqual([
      'Plot: Nothing opened its ◆ this round. What it produced last stands.',
      'Ask: The model said no.',
      'Say it: AI node "ask" failed before it, so it could not run.',
    ]);
  });

  it('counts a node that reused its last result apart from those that ran', () => {
    const reused = round({ result: { status: 'success', outputs: {}, node_results: [
      { node_id: 'read', status: 'success', inputs: {}, outputs: {}, reused: true },
      { node_id: 'shape', status: 'success', inputs: {}, outputs: {} },
    ] } });
    expect(roundExplained(reused)?.line).toMatch(/-- 1 ran, 1 reused its last result$/);
  });

  it('says nothing while the round goes', () => {
    expect(roundExplained(round({ done: false }))).toBeNull();
    expect(roundExplained(null)).toBeNull();
  });
});
