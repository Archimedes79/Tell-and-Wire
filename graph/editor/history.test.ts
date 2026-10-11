import { describe, it, expect } from 'vitest';
import { exchangeEntry, exchangeLabel, partExchanges, withExchange } from './history.ts';

/** history.md is the conversation about one node: each part's chat lists its own exchanges from it. */

describe('the exchanges of a part', () => {
  it('are read back from their headings, oldest first, and are not mixed up with another part\'s', () => {
    const at = (hour: number) => new Date(2026, 9, 9, hour, 5);
    let history = '';
    for (const [hour, label] of [
      [9, exchangeLabel('Output')],
      [10, exchangeLabel('Output', 'also the\nlongest word')],
      [11, exchangeLabel('Code', 'count them')],
      [12, exchangeLabel('Output', 'a number, not text', { failed: true })],
      [13, exchangeLabel('Output', undefined, { fix: true })],
      [14, 'Change of the graph: add a chart'],
    ] as const) history = withExchange(history, exchangeEntry(label, [], at(hour)));

    expect(partExchanges(history, 'Output')).toEqual([
      { at: '2026-10-09 09:05', said: '', fix: false, failed: false },
      { at: '2026-10-09 10:05', said: 'also the longest word', fix: false, failed: false },
      { at: '2026-10-09 12:05', said: 'a number, not text', fix: false, failed: true },
      { at: '2026-10-09 13:05', said: '', fix: true, failed: false },
    ]);
    expect(partExchanges(history, 'Code').map((one) => one.said)).toEqual(['count them']);
    expect(partExchanges(history, 'Input')).toEqual([]);
  });
});
