import { describe, it, expect } from 'vitest';
import { roundExplained } from './roundWords';

const result = (node_id: string, status: string, extra: Record<string, unknown> = {}) => ({ node_id, status, ...extra });

describe('what a round says of itself', () => {
  it('says where the chain gave out: a node that failed, else one with nothing arriving on a wire it needs -- not a gate kept shut by design', () => {
    const round = {
      done: true, started: { event: 'start', by: 'button' },
      result: { node_results: [
        result('start', 'success'), result('pantry', 'success'),
        result('gate', 'skipped', { messages: ['Nothing opened its ◆ this round. It has produced nothing yet, so what needs it waits.'] }),
        result('picker', 'skipped', { messages: ['Nothing arrived on "Pantry Data".'] }),
        result('ai', 'skipped', { messages: ['What feeds this node had nothing to do.'] }),
      ] },
    };
    const said = roundExplained(round as never, (id) => id.toUpperCase());
    expect(said?.line).toBe('Last run: "START", from "BUTTON" -- 2 nodes ran, 3 had nothing to do');
    expect(said?.stopped).toEqual({ node: 'picker', why: 'Nothing arrived on "Pantry Data".' });
    // A failure is where it stopped, whatever came before it in the round.
    const failed = { ...round, result: { node_results: [...round.result.node_results, result('crash', 'error', { error: 'CRASH: boom' })] } };
    expect(roundExplained(failed as never, (id) => id.toUpperCase())?.stopped).toEqual({ node: 'crash', why: 'boom' });
    // A gate kept shut alone is no stop.
    expect(roundExplained({ ...round, result: { node_results: [result('a', 'success'), result('gate', 'skipped', { messages: ['Nothing opened its ◆ this round.'] })] } } as never)?.stopped).toBeUndefined();
  });
});
