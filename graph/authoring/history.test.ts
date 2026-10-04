import { describe, it, expect } from 'vitest';
import type { AICall } from './history.ts';
import { exchangeEntry, withExchange } from './history.ts';

const call = (over: Partial<AICall> = {}): AICall => ({
  provider: 'google', model: 'gemini-flash-lite-latest', system: 'You write code.', prompt: 'Count the words.',
  sent_chars: 31, reply: '```js\nfunction run() {}\n```', reply_chars: 25, seconds: 1.2, error: null, ...over,
});
const AT = new Date(2026, 8, 28, 9, 5);

describe('the history of a node\'s ✨ exchanges', () => {
  it('keeps what was sent and what came back, fenced so a reply cannot close it, and drops the oldest whole beyond its limit, never the newest', () => {
    const entry = exchangeEntry('✨ Code', [call(), call({ reply: null, error: 'quota exceeded', seconds: 0.4 })], AT);
    expect(entry).toContain('Prompt:\n\n```\nCount the words.\n```');
    expect(entry).toContain('### Came back after 1.2 s\n\n````\n```js\nfunction run() {}\n```\n````');
    expect(entry).toContain('### Failed after 0.4 s\n\n```\nquota exceeded\n```');

    const old = [1, 2, 3].map((n) => exchangeEntry(`✨ Code ${n}`, [call({ prompt: 'x'.repeat(200) })], AT));
    const history = old.reduce((text, one) => withExchange(text, one), '');
    const newest = exchangeEntry('✨ Code 4', [call({ prompt: 'y'.repeat(200) })], AT);
    const kept = withExchange(history, newest, old[0].length * 2 + 10);
    expect(kept).not.toContain('✨ Code 1');
    expect(kept).not.toContain('✨ Code 2');
    expect(kept.startsWith('## 2026-09-28 09:05 · ✨ Code 3')).toBe(true);
    expect(kept.endsWith(newest)).toBe(true);
    // Longer than the limit alone, it is still kept.
    expect(withExchange(history, newest, 10)).toBe(newest);
  });
});
