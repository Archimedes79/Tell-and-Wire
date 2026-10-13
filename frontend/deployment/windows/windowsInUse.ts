// The windows of a gui, read off its blocks, and which of them are current.
//
// A tool made of windows says so in its gui and nowhere else: every block has
// `group`, the id of its window (which is also its start point), the heading
// block has `span` (cells across) and `after` (the windows this one takes
// something from). So a package that carries `gui.json` can draw the page and
// run the windows in order without the file the notebook editor keeps.

import type { GuiWidget } from '../gui/kit/guiWidget';
import { currentWindows, runOrder, type Done, type Linked } from '../../../gui/windows/order.ts';

/** A block of a window: the gui's block, with the keys windows add. */
export type WindowBlock = GuiWidget & { group?: string; span?: number; after?: string[]; page_at?: number; page_style?: string };

/** One window of the page. */
export interface PageWindow extends Linked {
  title: string;
  /** Cells across of the page's 16. */
  span: number;
  /** Its blocks, in the order they are drawn. */
  blocks: WindowBlock[];
  /** The blocks whose values its round is sent: those that send to its start point. */
  inputs: string[];
  /** The block that starts it by a press, if it has one; else one that starts it by a change. */
  starter: string | null;
  /** Where it stands on the page among its words, when the page has any (`page_at` of the heading). */
  at?: number;
}

/** A line of the page that is words: a heading, a paragraph, a list (bullets or numbered), a quotation or a gap, and where it stands. */
export interface PageNote {
  id: string;
  at: number;
  style: 'h1' | 'h2' | 'p' | 'ul' | 'ol' | 'quote' | 'space';
  text: string;
}

/** Whether a gui is a page of windows: its blocks say so. */
export function isWindows(blocks: readonly GuiWidget[]): boolean {
  return blocks.some((block) => typeof (block as WindowBlock).group === 'string');
}

/** The windows of *blocks*, in the order they first appear; a block with no window is not drawn here. */
export function pageWindows(blocks: readonly GuiWidget[]): PageWindow[] {
  const found = new Map<string, PageWindow>();
  for (const block of blocks as readonly WindowBlock[]) {
    if (typeof block.group !== 'string') continue;
    let window = found.get(block.group);
    if (!window) {
      window = { id: block.group, title: block.group, span: 8, after: [], blocks: [], inputs: [], starter: null };
      found.set(block.group, window);
    }
    window.blocks.push(block);
    // The heading is the block that says how wide the window is.
    if (typeof block.span === 'number') {
      window.title = String(block.value ?? block.group);
      window.span = Math.min(16, Math.max(1, Math.round(block.span)));
      if (Array.isArray(block.after)) window.after = block.after.filter((one): one is string => typeof one === 'string');
      if (typeof block.page_at === 'number') window.at = block.page_at;
    }
    // A block that also shows what the window makes (a chat) is where it is talked to, not an input whose change leaves the window out of date.
    if (block.sends_to?.includes(block.group) && !block.shows) window.inputs.push(block.id);
    // A block that only fires (a button) starts it by a press; one that also sends (an input) starts it by a change.
    if (block.fires === block.group && (window.starter === null || !block.sends_to?.length)) window.starter = block.id;
  }
  return [...found.values()];
}

/** The words of the page, read off its blocks: the blocks that have no window and say where they stand. */
export function pageNotes(blocks: readonly GuiWidget[]): PageNote[] {
  const styles = ['h1', 'h2', 'p', 'ul', 'ol', 'quote', 'space'];
  return (blocks as readonly WindowBlock[]).flatMap((block): PageNote[] => (typeof block.group !== 'string' && typeof block.page_at === 'number' && styles.includes(String(block.page_style))
    ? [{ id: block.id, at: block.page_at, style: block.page_style as PageNote['style'], text: String(block.value ?? '') }] : []));
}

/** What a window was last run with, and what it saw of the windows it takes from. */
export interface RunOf {
  /** Counts the runs: a later run has a higher one. */
  stamp: number;
  /** What its input blocks held when it was run, by block id. */
  input: Record<string, unknown>;
  /** The stamp of each window it takes from, as it was when this one ran. */
  saw: Record<string, number>;
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Which windows ran, and which of those no longer answer to the page: an input
 * holds something else than it did, or a window they take from ran again since.
 * *held* is what a block holds now.
 */
export function doneNow(windows: readonly PageWindow[], runs: Readonly<Record<string, RunOf>>, held: (blockId: string) => unknown): Done {
  const ran = new Set<string>();
  const changed = new Set<string>();
  for (const window of windows) {
    const run = runs[window.id];
    if (!run) continue;
    ran.add(window.id);
    const edited = window.inputs.some((id) => !same(run.input[id], held(id)));
    const behind = window.after.some((id) => (runs[id]?.stamp ?? 0) !== (run.saw[id] ?? 0));
    if (edited || behind) changed.add(window.id);
  }
  return { ran, changed };
}

/** The windows to run for *id* to answer to what is on the page: the ones before it that are not current, in order, and *id* last. */
export function planFor(windows: readonly PageWindow[], runs: Readonly<Record<string, RunOf>>, held: (blockId: string) => unknown, id: string): string[] {
  return runOrder(windows, id, doneNow(windows, runs, held));
}

/** Whether window *id* answers to what is on the page. */
export function isCurrent(windows: readonly PageWindow[], runs: Readonly<Record<string, RunOf>>, held: (blockId: string) => unknown, id: string): boolean {
  return currentWindows(windows, doneNow(windows, runs, held)).has(id);
}

/** *runs* after window *window* was run with what its input blocks held. */
export function recorded(runs: Readonly<Record<string, RunOf>>, window: PageWindow, held: (blockId: string) => unknown): Record<string, RunOf> {
  const stamp = Math.max(0, ...Object.values(runs).map((run) => run.stamp)) + 1;
  return {
    ...runs,
    [window.id]: {
      stamp,
      input: Object.fromEntries(window.inputs.map((id) => [id, held(id)])),
      saw: Object.fromEntries(window.after.map((id) => [id, runs[id]?.stamp ?? 0])),
    },
  };
}
