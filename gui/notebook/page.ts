// The page: headings, text, lists and gaps as in the plainest editor of pages, with the windows standing in them.
//
// A page is a list of blocks and the document keeps it beside its windows (`Windows.page`). It is
// read as Markdown reads -- `# Title`, `## Section`, paragraphs, `- items` -- plus `[space]` for a gap and
// `[window: id]` for a window, so a page can be written as text and shown as a web page (`toMarkdown`,
// `fromMarkdown`). Pure functions from document to document, like the rest of `edit.ts`: the editor's buttons
// are one line each, undo is a list of documents.

import { addWindow } from './edit.ts';
import { BLOCK_KINDS, freshBlockId, introPage, pageOf } from './pageModel.ts';
import type { BlockKind, PageBlock, Windows } from './windows.ts';

export { BLOCK_KINDS, freshBlockId, introPage, pageOf };

/** The kinds whose text is lines, one item or one line of the quotation to a line. */
export const LINE_KINDS: readonly BlockKind[] = ['ul', 'ol', 'quote'];

/**
 * The document with *page* as its page -- and its windows in the order they stand in it, since that is the order
 * they are read and run in.
 */
export function withPage(doc: Windows, page: PageBlock[]): Windows {
  const order = page.flatMap((block) => (block.kind === 'window' && block.window ? [block.window] : []));
  const windows = [...doc.windows].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  return { ...doc, page, windows };
}

/** A page with a first window and the words around it. */
export function startPage(name = 'My tool'): Windows {
  const doc = addWindow({ name, description: '', windows: [] }, 'First window');
  return { ...doc, page: introPage(doc) };
}

/**
 * A block of *kind* put in at place *at* (the end, where it says none). A window is a new one, made with its
 * first cell and its first output, so it can be used at once.
 */
export function addBlock(doc: Windows, kind: BlockKind, at?: number): Windows {
  const page = pageOf(doc);
  const place = Math.max(0, Math.min(at ?? page.length, page.length));
  if (kind === 'window') {
    const grown = addWindow(doc);
    const made = grown.windows[grown.windows.length - 1];
    const before = pageOf({ ...grown, page });
    // The window the page does not place yet came in at the end; it belongs where it was asked for.
    const without = before.filter((block) => block.window !== made.id);
    without.splice(place, 0, { id: freshBlockId(before), kind: 'window', window: made.id });
    return withPage(grown, without);
  }
  const block: PageBlock = { id: freshBlockId(page), kind, ...(kind === 'space' ? {} : { text: '' }) };
  return withPage(doc, [...page.slice(0, place), block, ...page.slice(place)]);
}

export function patchBlock(doc: Windows, id: string, patch: Partial<Pick<PageBlock, 'text'>>): Windows {
  return withPage(doc, pageOf(doc).map((block) => (block.id === id ? { ...block, ...patch } : block)));
}

/** A block of text made another kind of text, keeping its words; a gap has none, and a window cannot be made of text. */
export function setKind(doc: Windows, id: string, kind: BlockKind): Windows {
  if (kind === 'window') return doc;
  return withPage(doc, pageOf(doc).map((block) => {
    if (block.id !== id || block.kind === 'window') return block;
    const { text, window, ...rest } = block;
    void window;
    if (kind === 'space') return { ...rest, kind };
    const words = kind === 'h1' || kind === 'h2' ? (text ?? '').replace(/\n/g, ' ') : text ?? '';
    return { ...rest, kind, text: words };
  }));
}

/** A block of text taken out. A window is not taken out of the page but off the document (`removeWindow`). */
export function removeBlock(doc: Windows, id: string): Windows {
  const page = pageOf(doc);
  const found = page.find((block) => block.id === id);
  if (!found || found.kind === 'window') return doc;
  return withPage(doc, page.filter((block) => block !== found));
}

/** A block one place earlier (-1) or later (+1). */
export function moveBlock(doc: Windows, id: string, by: -1 | 1): Windows {
  const page = pageOf(doc);
  const at = page.findIndex((block) => block.id === id);
  const to = at + by;
  if (at < 0 || to < 0 || to >= page.length) return doc;
  const moved = page.slice();
  [moved[at], moved[to]] = [moved[to], moved[at]];
  return withPage(doc, moved);
}

// ---- as Markdown ---------------------------------------------------------------------------------------

/** The page as text: one block to a paragraph of the file, a list's items one to a line. */
export function toMarkdown(doc: Windows): string {
  return pageOf(doc).map((block) => {
    switch (block.kind) {
      case 'h1': return `# ${block.text ?? ''}`;
      case 'h2': return `## ${block.text ?? ''}`;
      case 'ul': return (block.text ?? '').split('\n').map((line) => `- ${line}`).join('\n');
      case 'ol': return (block.text ?? '').split('\n').map((line, at) => `${at + 1}. ${line}`).join('\n');
      case 'quote': return (block.text ?? '').split('\n').map((line) => `> ${line}`).join('\n');
      case 'space': return '[space]';
      case 'window': return `[window: ${block.window}]`;
      default: return block.text ?? '';
    }
  }).join('\n\n') + '\n';
}

/**
 * The document with the page *text* says. A window it names that the document has stands where it is named; a name
 * it does not have is left out, and a window it does not name goes to the end.
 */
export function fromMarkdown(doc: Windows, text: string): Windows {
  const ids = new Set(doc.windows.map((window) => window.id));
  const blocks: PageBlock[] = [];
  const add = (kind: BlockKind, fields: Partial<PageBlock> = {}): void => { blocks.push({ id: `b${blocks.length + 1}`, kind, ...fields }); };
  let paragraph: string[] = [];
  /** The lines of a list or a quotation being read, and which it is. */
  let lines: string[] = [];
  let lined: 'ul' | 'ol' | 'quote' = 'ul';
  const flush = (): void => {
    if (paragraph.length) add('p', { text: paragraph.join('\n') });
    if (lines.length) add(lined, { text: lines.join('\n') });
    paragraph = [];
    lines = [];
  };
  /** A line of a list or a quotation: it goes with the lines before it of the same kind, or begins a block of its own. */
  const addLine = (kind: 'ul' | 'ol' | 'quote', text: string): void => {
    if (paragraph.length || (lines.length && lined !== kind)) flush();
    lined = kind;
    lines.push(text);
  };
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const window = /^\[window:\s*([^\]\s]+)\s*\]$/.exec(line.trim());
    if (!line.trim()) flush();
    // A mark with nothing after it is still the block (`toMarkdown` writes an empty heading as "# "): not a paragraph of "#".
    else if (/^##(\s+|$)/.test(line)) { flush(); add('h2', { text: line.replace(/^##\s*/, '') }); }
    else if (/^#(\s+|$)/.test(line)) { flush(); add('h1', { text: line.replace(/^#\s*/, '') }); }
    else if (/^\s*\[space\]\s*$/.test(line)) { flush(); add('space'); }
    else if (window) { flush(); if (ids.has(window[1])) add('window', { window: window[1] }); }
    else if (/^[-*](\s+|$)/.test(line)) addLine('ul', line.replace(/^[-*]\s*/, ''));
    else if (/^\d+[.)](\s+|$)/.test(line)) addLine('ol', line.replace(/^\d+[.)]\s*/, ''));
    else if (/^>\s?/.test(line)) addLine('quote', line.replace(/^>\s?/, ''));
    else { if (lines.length) flush(); paragraph.push(line); }
  }
  flush();
  return withPage(doc, pageOf({ ...doc, page: blocks }));
}
