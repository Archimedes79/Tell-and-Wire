import { describe, expect, it } from 'vitest';
import { piece } from './paging.ts';

const paragraphs = Array.from({ length: 40 }, (_, n) => `Paragraph ${n} says something of about sixty characters, give or take.`).join('\n\n');

describe('piece', () => {
  it('returns a short text whole, with nothing after it', () => {
    expect(piece('short', 0, 1000)).toEqual({ text: 'short', start: 0, end: 5, next: null });
  });

  it('ends at a blank line when there is one in the second half', () => {
    const part = piece(paragraphs, 0, 1000);
    expect(part.text.endsWith('give or take.')).toBe(true);
    expect(part.end).toBeLessThanOrEqual(1000);
    expect(part.end).toBeGreaterThan(500);
    expect(paragraphs.slice(part.end, part.next ?? undefined).trim()).toBe('');
  });

  it('reads a whole text in pieces that join up, whatever the size', () => {
    for (const max of [500, 777, 1000, 4000]) {
      const seen: string[] = [];
      let at: number | null = 0;
      while (at !== null) {
        const part = piece(paragraphs, at, max);
        expect(part.text.length).toBeLessThanOrEqual(max);
        seen.push(part.text);
        at = part.next;
      }
      expect(seen.join(' ').replace(/\s+/g, ' ')).toBe(paragraphs.replace(/\s+/g, ' '));
    }
  });

  it('falls back to a line end, a sentence end, a space, and only then cuts a word', () => {
    expect(piece(`${'a'.repeat(600)}\n${'b'.repeat(600)}`, 0, 1000).text).toBe('a'.repeat(600));
    // A sentence end beats a space; with no sentence end, a space is the place.
    expect(piece(`${'a '.repeat(300)}end. ${'b '.repeat(300)}`, 0, 1000).text.endsWith('end.')).toBe(true);
    expect(piece(`${'x'.repeat(700)}. ${'y'.repeat(600)}`, 0, 1000).text.endsWith('.')).toBe(true);
    expect(piece('word '.repeat(400), 0, 1000).text.endsWith('word')).toBe(true);
    expect(piece('z'.repeat(2000), 0, 1000).text).toHaveLength(1000);
  });

  it('starts anywhere, and past the end there is nothing', () => {
    expect(piece('hello world', 6, 100).text).toBe('world');
    expect(piece('hello', 99, 100)).toEqual({ text: '', start: 5, end: 5, next: null });
    expect(piece('hello', -4, 100).start).toBe(0);
  });

  it('never splits a character that takes two UTF-16 units', () => {
    const lone = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
    const text = '😀'.repeat(900);
    let at: number | null = 0;
    let total = '';
    while (at !== null) {
      const part = piece(text, at, 1001);
      expect(lone.test(part.text)).toBe(false);
      total += part.text;
      at = part.next;
    }
    expect(total).toBe(text);
  });
});
