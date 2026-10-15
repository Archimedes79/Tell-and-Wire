import { describe, expect, it } from 'vitest';
import { CallFailed } from './api';
import { modelSaid } from './store';

describe('what the model sent, beside the error', () => {
  it('is the last reply of the calls that led to the failure', () => {
    const failed = new CallFailed(500, { detail: 'The windows could not be made.', calls: [{ reply: 'first try' }, { reply: null }, { reply: 'Here is your page: not JSON' }] });
    expect(modelSaid(failed)).toBe('Here is your page: not JSON');
  });

  it('is nothing for a failure with no calls, or a reply that says nothing', () => {
    expect(modelSaid(new CallFailed(500, { detail: 'x' }))).toBe('');
    expect(modelSaid(new CallFailed(500, { calls: [{ reply: '  ' }] }))).toBe('');
    expect(modelSaid(new Error('network'))).toBe('');
  });

  it('is cut where it would be more than a banner can hold', () => {
    const said = modelSaid(new CallFailed(500, { calls: [{ reply: 'x'.repeat(10_000) }] }));
    expect(said.length).toBeLessThan(6100);
    expect(said.endsWith(' …')).toBe(true);
  });
});
