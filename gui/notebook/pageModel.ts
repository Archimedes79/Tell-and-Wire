// What a page is made of, before anything is done to it: which blocks it has, and the one a tool without a page of its own gets.
//
// Apart from `page.ts` (the edits) so the compiler (`windows.ts`) can read the page without importing what edits windows.

import type { BlockKind, PageBlock, Windows } from './windows.ts';

export const BLOCK_KINDS: readonly BlockKind[] = ['h1', 'h2', 'p', 'ul', 'space', 'window'];

const isKind = (value: unknown): value is BlockKind => BLOCK_KINDS.includes(value as BlockKind);

/** An id no block of *page* has. */
export function freshBlockId(page: readonly PageBlock[]): string {
  const used = new Set(page.map((block) => block.id));
  for (let n = page.length + 1; ; n += 1) if (!used.has(`b${n}`)) return `b${n}`;
}

/** The page of a tool that has none yet: its name, what it says it is, and the windows in turn. */
export function introPage(doc: Windows): PageBlock[] {
  const page: PageBlock[] = [{ id: 'b1', kind: 'h1', text: doc.name }];
  if (doc.description.trim()) page.push({ id: 'b2', kind: 'p', text: doc.description.trim() });
  for (const window of doc.windows) page.push({ id: freshBlockId(page), kind: 'window', window: window.id });
  return page;
}

/**
 * The page as it stands: what the document keeps, with a window that is gone left out and a window it does not
 * place put at the end -- so a window added or removed anywhere is on the page or off it, with no second step.
 */
export function pageOf(doc: Windows): PageBlock[] {
  const ids = new Set(doc.windows.map((window) => window.id));
  const seen = new Set<string>();
  const used = new Set<string>();
  const page: PageBlock[] = [];
  for (const block of doc.page ?? introPage(doc)) {
    if (!isKind(block.kind) || used.has(block.id)) continue;
    if (block.kind === 'window') {
      if (!block.window || !ids.has(block.window) || seen.has(block.window)) continue;
      seen.add(block.window);
    }
    used.add(block.id);
    page.push(block);
  }
  for (const window of doc.windows) {
    if (!seen.has(window.id)) page.push({ id: freshBlockId(page), kind: 'window', window: window.id });
  }
  return page;
}
