import { describe, it, expect } from 'vitest';
import { roundExplained } from './roundWords';

const result = (node_id: string, status: string, extra: Record<string, unknown> = {}) => ({ node_id, status, ...extra });

describe('what a round says of itself', () => {
  it('says where the chain gave out: the first node, in the order it ran, that failed or had nothing to do', () => {
    const round = {
      done: true, started: { event: 'start', by: 'button' },
      result: { node_results: [
        result('start', 'success'), result('pantry', 'success'),
        result('picker', 'skipped', { messages: ['Nothing arrived on "Pantry Data".'] }),
        result('ai', 'skipped', { messages: ['What feeds this node had nothing to do.'] }),
      ] },
    };
    const said = roundExplained(round as never, (id) => id.toUpperCase());
    expect(said?.line).toBe('Last run: "START", from "BUTTON" -- 2 nodes ran, 2 had nothing to do');
    expect(said?.stopped).toEqual({ node: 'picker', why: 'Nothing arrived on "Pantry Data".' });
    expect(roundExplained({ ...round, result: { node_results: [result('a', 'success')] } } as never)?.stopped).toBeUndefined();
  });
});
