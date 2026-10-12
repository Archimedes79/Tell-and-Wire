import { describe, expect, it } from 'vitest';
import type { RoundSnapshot } from '../kit/api/client';
import { roundStatus } from './DeliveredHeader';
import { roundError } from './guiInUse';

/**
 * What a person who was handed a tool is told of a run that did not go: the same
 * for a node that failed with the rest going ("partial") as for a run that
 * stopped ("error") -- a run that failed in silence leaves them with an empty
 * result and no word why.
 */

const round = (result: { status: string; error?: string } | null, extra: Partial<RoundSnapshot> = {}): RoundSnapshot =>
  ({ done: true, cancelled: false, error: null, result, ...extra }) as unknown as RoundSnapshot;

describe('how a delivered tool says a run went', () => {
  it('says why and that it failed, for a run that stopped and for one that went in part', () => {
    for (const status of ['error', 'partial']) {
      const failed = round({ status, error: 'code node "Count" failed: One word is not a text.' });
      expect(roundError(failed)).toContain('One word is not a text');
      expect(roundStatus(failed).failed).toBe(true);
    }
    expect(roundStatus(round({ status: 'partial' })).label).toMatch(/Partly/);
    expect(roundStatus(round({ status: 'error' })).label).toMatch(/Failed/);
  });

  it('says nothing of a run that went, is going or was stopped', () => {
    const went = round({ status: 'success' });
    expect(roundError(went)).toBe('');
    expect(roundStatus(went)).toEqual({ label: '✅ Done', failed: false });
    expect(roundError(round(null, { done: false }))).toBe('');
    expect(roundError(round({ status: 'error', error: 'x' }, { cancelled: true }))).toBe('');
    expect(roundStatus(round(null, { done: false })).label).toMatch(/Running/);
  });
});
