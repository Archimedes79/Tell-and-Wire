import { describe, it, expect } from 'vitest';
import { asText, inlineText } from './text.ts';

/**
 * A value as the page's blocks show it: a box of text, a table's cells, a
 * tool's result without a page.
 */
describe('a value, as a box of text reads it', () => {
  it('reads a list of names as lines', () => {
    expect(asText(['a.txt', 'b.txt'])).toBe('a.txt\nb.txt');
  });

  it('gives paragraphs air: a summary per file is three answers, not one', () => {
    const long = 'The Lighthouse Keeper: a keeper counts ships for thirty-one years, and the ledger outlives the light.';
    expect(asText([long, 'Short.'])).toBe(`${long}\n\nShort.`);
  });

  it('writes a record as its keys and values, a line each -- not its values bare -- and nothing as nothing', () => {
    // Rebuilt by hand: a word count's result read "32 / 2 / directions",
    // with nothing to say which number was which.
    expect(asText({ words: 32, sentences: 2, longest: 'directions' })).toBe('words: 32\nsentences: 2\nlongest: directions');
    expect(asText({ tags: ['a', 'b'], where: { x: 1 } })).toBe('tags: a, b\nwhere: {"x":1}');
    // Records in a list are told apart by a blank line.
    expect(asText([{ a: 1, b: 2 }, { a: 3, b: 4 }])).toBe('a: 1\nb: 2\n\na: 3\nb: 4');
    expect(asText(null)).toBe('');
    expect(asText(undefined)).toBe('');
    expect(asText(7)).toBe('7');
  });
});

describe('a value on one line', () => {
  it('joins a list with commas, as a table cell shows it -- not ["a","b"]', () => {
    // Rebuilt by hand: a table showed a list in a cell as `["a","b"]`.
    expect(inlineText(['a', 'b'])).toBe('a, b');
    expect(inlineText([1, null, 2])).toBe('1, 2');
    expect(inlineText({ x: 1 })).toBe('{"x":1}');
    expect(inlineText(null)).toBe('');
  });
});
