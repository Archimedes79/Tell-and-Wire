// A long Markdown text, cut into chunks that each stand on their own.
//
// What a chunk is for: a model with a small context reads one, and says what
// it found. So a chunk ends where a person would stop reading, not where a
// count ran out:
//   - a heading starts a new chunk once the one before is a fair size, and is
//     never left at the end of one, away from the text it heads;
//   - a table and a code block are not cut in the middle; one too big for a
//     chunk is cut between rows or lines, each part carrying its table header
//     or its fence;
//   - what is left is cut at paragraphs, by `piece` (`paging.ts`).
// Each chunk says which section it is in (the headings above it, "A > B") and,
// for a text that marks its pages ([Page 3]), which pages it covers.
//
// The same file is in mcp/documents: the two packages share nothing.

import { piece } from './paging.ts';

export interface Chunk {
  index: number;
  /** Where in the whole text it starts and ends. */
  start: number;
  end: number;
  /** The headings it is under, outermost first: "Methods > Data". Empty above the first heading. */
  section: string;
  /** The pages it covers where the text marks them: "3" or "3-4". Empty where it does not. */
  pageRange: string;
  /** The text. A part of a table or code block that was too big carries its table header or its fence. */
  text: string;
}

interface Block { start: number; end: number; kind: 'heading' | 'table' | 'fence' | 'text'; level: number; title: string }

/** A stretch of the text that is packed whole: a block, or a part of one that was too big. */
interface Unit {
  start: number;
  end: number;
  text: string;
  /** Not a plain slice of the source: it carries a header or a fence the source has once. */
  synthetic: boolean;
  heading: boolean;
  section: string;
  firstPage: number;
  lastPage: number;
}

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const FENCE = /^\s*(`{3,}|~{3,})/;
const isRow = (line: string): boolean => line.trimStart().startsWith('|');
const PAGE_MARK = /^\[Page (\d+)\]$/gm;

/** The text as blocks: headings, tables, fenced code, and paragraphs between blank lines. */
function blocksOf(text: string): Block[] {
  const lines: { start: number; end: number; text: string }[] = [];
  let at = 0;
  for (const line of text.split('\n')) {
    lines.push({ start: at, end: at + line.length, text: line });
    at += line.length + 1;
  }
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.text.trim()) { i += 1; continue; }
    const fence = FENCE.exec(line.text);
    const heading = HEADING.exec(line.text);
    let last = i;
    let kind: Block['kind'] = 'text';
    if (fence) {
      kind = 'fence';
      last = i + 1;
      while (last < lines.length && !lines[last].text.trimStart().startsWith(fence[1])) last += 1;
      last = Math.min(last, lines.length - 1);
    } else if (heading) {
      kind = 'heading';
    } else if (isRow(line.text)) {
      kind = 'table';
      while (last + 1 < lines.length && isRow(lines[last + 1].text)) last += 1;
    } else {
      while (last + 1 < lines.length) {
        const next = lines[last + 1].text;
        if (!next.trim() || HEADING.test(next) || FENCE.test(next) || isRow(next)) break;
        last += 1;
      }
    }
    blocks.push({ start: line.start, end: lines[last].end, kind, level: heading ? heading[1].length : 0, title: heading ? heading[2] : '' });
    i = last + 1;
  }
  return blocks;
}

/** The first and last page marked in *text*; *carry* where it marks none, or before its first mark. */
function pagesOf(text: string, carry: number): { first: number; last: number } {
  const marks = [...text.matchAll(PAGE_MARK)];
  if (!marks.length) return { first: carry, last: carry };
  const startsOnAMark = text.trimStart().startsWith(marks[0][0]);
  return { first: startsOnAMark ? Number(marks[0][1]) : carry, last: Number(marks[marks.length - 1][1]) };
}

/** *lines* in groups that each fit in *room* characters (a line of its own that is longer still goes alone). */
function groups(lines: { text: string; start: number; end: number }[], room: number): { text: string; start: number; end: number }[][] {
  const out: { text: string; start: number; end: number }[][] = [];
  let current: { text: string; start: number; end: number }[] = [];
  let size = 0;
  for (const line of lines) {
    if (current.length && size + line.text.length + 1 > room) { out.push(current); current = []; size = 0; }
    current.push(line);
    size += line.text.length + 1;
  }
  if (current.length) out.push(current);
  return out;
}

/** A block too big for one chunk, as parts that fit. */
function split(text: string, block: Block, max: number): { start: number; end: number; text: string; synthetic: boolean }[] {
  const body = text.slice(block.start, block.end);
  if (block.kind === 'table' || block.kind === 'fence') {
    const lines: { text: string; start: number; end: number }[] = [];
    let at = block.start;
    for (const line of body.split('\n')) { lines.push({ text: line, start: at, end: at + line.length }); at += line.length + 1; }
    let head: string[] = [];
    let tail: string[] = [];
    let rest = lines;
    if (block.kind === 'table') {
      // The header and its dashes, said again over every part.
      const dashes = lines.length > 1 && /^[\s|:-]+$/.test(lines[1].text) && lines[1].text.includes('-');
      if (dashes) { head = [lines[0].text, lines[1].text]; rest = lines.slice(2); }
    } else {
      const open = lines[0].text;
      const closed = lines.length > 1 && FENCE.test(lines[lines.length - 1].text);
      head = [open];
      tail = [closed ? lines[lines.length - 1].text : '```'];
      rest = lines.slice(1, closed ? -1 : undefined);
    }
    const room = Math.max(1, max - head.concat(tail).reduce((sum, line) => sum + line.length + 1, 0));
    return groups(rest, room).map((part) => ({
      start: part[0].start,
      end: part[part.length - 1].end,
      text: [...head, ...part.map((line) => line.text), ...tail].join('\n'),
      synthetic: true,
    }));
  }
  const parts: { start: number; end: number; text: string; synthetic: boolean }[] = [];
  let at: number | null = 0;
  while (at !== null) {
    const part = piece(body, at, max);
    if (part.text) parts.push({ start: block.start + part.start, end: block.start + part.end, text: part.text, synthetic: false });
    at = part.next;
  }
  return parts;
}

/** The units, in order, with the section and the pages each is in. */
function unitsOf(text: string, max: number): Unit[] {
  const units: Unit[] = [];
  const path: string[] = [];
  let page = 0;
  for (const block of blocksOf(text)) {
    if (block.kind === 'heading') path.splice(block.level - 1, path.length, block.title);
    const section = path.join(' > ');
    const whole = block.end - block.start <= max;
    for (const part of whole ? [{ start: block.start, end: block.end, text: text.slice(block.start, block.end), synthetic: false }] : split(text, block, max)) {
      const pages = pagesOf(part.text, page);
      page = pages.last;
      units.push({ ...part, heading: block.kind === 'heading', section, firstPage: pages.first, lastPage: pages.last });
    }
  }
  return units;
}

/** How long a chunk of *units* would be. */
function lengthOf(units: Unit[], text: string): number {
  if (units.some((unit) => unit.synthetic)) return units.reduce((sum, unit) => sum + unit.text.length, 0) + 2 * (units.length - 1);
  return text.slice(units[0].start, units[units.length - 1].end).length;
}

/**
 * *text* as chunks of at most *max* characters. A chunk is shorter when a
 * heading or the end of a table comes sooner; a heading starts a new chunk once
 * the chunk before holds 40 % of *max*.
 */
export function chunkText(text: string, max: number): Chunk[] {
  const chunks: Chunk[] = [];
  let current: Unit[] = [];
  const flush = (): void => {
    if (!current.length) return;
    const first = current[0];
    const last = current[current.length - 1];
    const synthetic = current.some((unit) => unit.synthetic);
    const pages = Math.max(...current.map((unit) => unit.lastPage)) ? [first.firstPage, last.lastPage] : [0, 0];
    chunks.push({
      index: chunks.length,
      start: first.start,
      end: last.end,
      section: first.section,
      pageRange: pages[1] === 0 ? '' : pages[0] === pages[1] ? String(pages[1]) : `${pages[0]}-${pages[1]}`,
      text: synthetic ? current.map((unit) => unit.text).join('\n\n') : text.slice(first.start, last.end),
    });
    current = [];
  };
  for (const unit of unitsOf(text, max)) {
    if (current.length) {
      const fits = lengthOf([...current, unit], text) <= max;
      const newSection = unit.heading && lengthOf(current, text) >= max * 0.4;
      if (!fits || newSection) {
        // A heading is not left at the end of a chunk, away from what it heads, if it can go with it.
        let keep = current.length;
        while (keep > 1 && current[keep - 1].heading && lengthOf([current[keep - 1], unit], text) <= max) keep -= 1;
        const carried = current.splice(keep);
        flush();
        current = carried;
      }
    }
    current.push(unit);
  }
  flush();
  return chunks;
}

export interface Picked {
  /** The chunk it is, or the one it is a part of. */
  index: number;
  start: number;
  end: number;
  content: string;
  /** Where the next chunk starts, or null at the end. */
  next: number | null;
}

/**
 * The chunk that starts at *start* -- 0, or the `next` of the one before. Any
 * other place gets the rest of the chunk it falls in.
 */
export function pick(text: string, chunks: Chunk[], start: number): Picked {
  const from = Math.max(0, Math.trunc(start));
  if (from >= text.length || !chunks.length) {
    return { index: chunks.length, start: Math.min(from, text.length), end: text.length, content: '', next: null };
  }
  let index = chunks.findIndex((chunk) => chunk.end > from);
  if (index < 0) index = chunks.length - 1;
  const chunk = chunks[index];
  const whole = from <= chunk.start;
  return {
    index,
    start: whole ? chunk.start : from,
    end: chunk.end,
    content: whole ? chunk.text : text.slice(from, chunk.end).trim(),
    next: chunks[index + 1]?.start ?? null,
  };
}

export interface OutlineEntry {
  index: number;
  start: number;
  end: number;
  chars: number;
  section: string;
  page_range: string;
}

/** What each chunk is, without its text: enough to choose one to read. */
export function outline(chunks: Chunk[]): OutlineEntry[] {
  return chunks.map((chunk) => ({
    index: chunk.index, start: chunk.start, end: chunk.end, chars: chunk.text.length, section: chunk.section, page_range: chunk.pageRange,
  }));
}
