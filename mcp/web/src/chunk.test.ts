import { describe, expect, it } from 'vitest';
import { chunkText, outline, pick } from './chunk.ts';

const paragraph = (n: number): string => `Paragraph ${n} says something of about sixty characters, give or take.`;
const lines = (count: number, make: (n: number) => string): string => Array.from({ length: count }, (_, n) => make(n)).join('\n\n');

/** What a chunk says, without the spacing: what a reader could tell apart. */
const squash = (text: string): string => text.replace(/\s+/g, ' ').trim();

describe('chunkText', () => {
  it('keeps a short text in one chunk', () => {
    const chunks = chunkText('# Title\n\nShort text.', 1000);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ index: 0, section: 'Title', pageRange: '', text: '# Title\n\nShort text.' });
  });

  it('cuts at a heading once the chunk before is a fair size, and says which section each is in', () => {
    const text = `# Report\n\n## Method\n\n${lines(12, paragraph)}\n\n## Results\n\n${lines(12, paragraph)}\n\n### Detail\n\n${paragraph(99)}`;
    const chunks = chunkText(text, 1500);
    const starts = chunks.map((chunk) => chunk.text.split('\n')[0]);
    expect(starts.some((line) => line === '## Results')).toBe(true);
    expect(chunks.find((chunk) => chunk.text.startsWith('## Results'))?.section).toBe('Report > Results');
    expect(chunks.at(-1)?.section).toBe('Report > Results > Detail');
    for (const chunk of chunks) expect(chunk.text.length).toBeLessThanOrEqual(1500);
  });

  it('does not leave a heading at the end of a chunk, away from its text', () => {
    // The paragraphs fill a chunk exactly up to the heading, so the heading would be the last thing in it.
    const filler = 'x'.repeat(940);
    const text = `${filler}\n\n## Next topic\n\n${'y'.repeat(900)}`;
    const chunks = chunkText(text, 1000);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].text).toBe(filler);
    expect(chunks[1].text.startsWith('## Next topic')).toBe(true);
  });

  it('cuts a table between rows, with its header over every part, and never cuts it in a row', () => {
    const rows = Array.from({ length: 40 }, (_, n) => `| row ${n} | value number ${n} |`);
    const table = ['| name | value |', '| --- | --- |', ...rows].join('\n');
    const chunks = chunkText(`Intro.\n\n${table}\n\nAfter.`, 400);
    const parts = chunks.filter((chunk) => chunk.text.includes('| name | value |'));
    expect(parts.length).toBeGreaterThan(2);
    for (const part of parts) {
      expect(part.text).toContain('| --- | --- |');
      for (const line of part.text.split('\n').filter((l) => l.startsWith('|'))) expect(line.endsWith('|')).toBe(true);
    }
    expect(squash(chunks.map((chunk) => chunk.text).join(' '))).toContain('row 39');
    for (const chunk of chunks) expect(chunk.text.length).toBeLessThanOrEqual(400);
  });

  it('cuts a code block between lines, each part inside its own fence', () => {
    const code = ['```ts', ...Array.from({ length: 60 }, (_, n) => `const value${n} = ${n};`), '```'].join('\n');
    const chunks = chunkText(code, 300);
    expect(chunks.length).toBeGreaterThan(2);
    for (const chunk of chunks) {
      expect(chunk.text.startsWith('```ts\n')).toBe(true);
      expect(chunk.text.endsWith('\n```')).toBe(true);
      expect(chunk.text.length).toBeLessThanOrEqual(300);
    }
  });

  it('cuts a paragraph that is bigger than a chunk, and loses nothing anywhere', () => {
    const text = `# A\n\n${'word '.repeat(900)}\n\n## B\n\n${lines(30, paragraph)}\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n\`\`\`\ncode\n\`\`\`\n\nEnd.`;
    for (const max of [500, 1000, 4000]) {
      const chunks = chunkText(text, max);
      for (const chunk of chunks) expect(chunk.text.length).toBeLessThanOrEqual(max);
      expect(squash(chunks.map((chunk) => chunk.text).join(' '))).toBe(squash(text));
    }
  });

  it('says which pages a chunk covers where the text marks them', () => {
    const text = `[Page 1]\n${'a '.repeat(300)}\n\n[Page 2]\n${'b '.repeat(300)}\n\n[Page 3]\n${'c '.repeat(300)}`;
    const chunks = chunkText(text, 700);
    expect(chunks.map((chunk) => chunk.pageRange)).toEqual(['1', '2', '3']);
    expect(chunkText(text, 5000)[0].pageRange).toBe('1-3');
  });
});

describe('pick', () => {
  const text = `# One\n\n${lines(10, paragraph)}\n\n# Two\n\n${lines(10, paragraph)}`;
  const chunks = chunkText(text, 800);

  it('walks the chunks, one after the other, by where each says the next starts', () => {
    const seen: string[] = [];
    let at: number | null = 0;
    while (at !== null) {
      const part = pick(text, chunks, at);
      expect(part.index).toBe(seen.length);
      seen.push(part.content);
      at = part.next;
    }
    expect(seen).toHaveLength(chunks.length);
    expect(squash(seen.join(' '))).toBe(squash(text));
  });

  it('gives the rest of a chunk to a start inside one, and nothing past the end', () => {
    const inside = pick(text, chunks, chunks[1].start + 10);
    expect(inside.index).toBe(1);
    expect(inside.start).toBe(chunks[1].start + 10);
    expect(inside.content).toBe(text.slice(chunks[1].start + 10, chunks[1].end).trim());
    expect(pick(text, chunks, text.length + 50)).toMatchObject({ content: '', next: null, index: chunks.length });
  });
});

describe('outline', () => {
  it('lists the chunks with their sections and sizes, without their text', () => {
    const entries = outline(chunkText(`# One\n\n${lines(10, paragraph)}\n\n# Two\n\n${lines(10, paragraph)}`, 400));
    expect(entries.length).toBeGreaterThan(2);
    expect(entries[0]).toMatchObject({ index: 0, start: 0, section: 'One', page_range: '' });
    expect(entries.at(-1)?.section).toBe('Two');
    expect(Object.keys(entries[0])).not.toContain('text');
  });
});
