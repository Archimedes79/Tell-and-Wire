// The notebook that is open: the document, where it is kept, what was done to it (undo), what its windows made, and the
// three things asked of the server that are about the document -- open, save, and describe.
//
// The windows are the document; the graph they compile to is made from them when it is needed (`compile`), held for a
// run and never edited. What a model wrote for a step (prompt, code) stays with the graph that was last made or opened,
// so a step that did not change keeps its writing (`windowsToGraph`'s `before`).

import { create } from 'zustand';
import { CallFailed, call, wordsOf } from './api';
import { pageOf, withPage } from '../../../gui/notebook/page.ts';
import { windowsToGraph, type Done, type Windows } from '../../../gui/notebook/windows.ts';
import type { Graph } from '../../../graph/graph.ts';
import type { RoundSnapshot } from '../../../backend/deployment/host/api.ts';

/** How many steps back undo goes. A page is a few kilobytes, so each step is the whole document. */
export const UNDO_LIMIT = 100;
/** Edits of one name closer together than this are one undo step: a sentence typed is not forty. */
const COALESCE_MS = 1500;

/** What running a window came to, in a word. */
export type Outcome = 'done' | 'empty' | 'failed' | 'stopped';

/** What one node of a round did, as the cells and the debug window say it. */
export interface NodeState {
  status: 'success' | 'error' | 'partial' | 'skipped';
  message: string;
  inputs: unknown;
  outputs: unknown;
  held: boolean;
  reused: boolean;
}

export interface WindowResult {
  outcome: Outcome;
  /** Why it did not come to anything, in the host's words; empty for a window that did. */
  message: string;
  /** What each output block of the window shows, by block id. */
  shown: Record<string, unknown>;
  nodes: Record<string, NodeState>;
}

/** A round that ran, kept for the debug window. */
export interface RunLog {
  id: string;
  window: string;
  title: string;
  at: number;
  outcome: Outcome;
  round: RoundSnapshot;
}

export type DockTab = 'cells' | 'hood' | 'debug';

export interface NotebookState {
  doc: Windows | null;
  /** The graph the windows were last compiled to, or were opened with: where what a model wrote for a step is kept. */
  graph: Graph | null;
  /** Where the project is kept; none while it is new. */
  path: string;
  /** The document as it was last opened or saved, to say whether there is something to save. */
  saved: string;
  /** When the project was last opened or saved (a time), none while it is new: the header says how long ago the page was changed after it. */
  savedAt: number;
  /** The graph on disk was changed by something else after the windows made it. */
  stale: boolean;
  past: Windows[];
  future: Windows[];
  /** Counts the documents opened: a run asks the host for a session of its own for each. */
  epoch: number;

  /** The page as it is read -- `app` -- or written. */
  mode: 'write' | 'app';
  /** The page as Markdown, to be typed in, instead of as blocks. */
  source: boolean;
  /** The window whose cells are open under the page; none, no dock. */
  window: string | null;
  tab: DockTab;
  /** The dock under the page is open. */
  dockOpen: boolean;
  /** The element or cell pointed at, to light up its other half: a block id. */
  hot: string | null;

  /** What the inputs hold now, by block id; an input not in it holds what its window says. */
  values: Record<string, unknown>;
  results: Record<string, WindowResult>;
  done: Done;
  /** The windows being run now, in order. */
  going: string[];
  log: RunLog[];

  busy: '' | 'opening' | 'saving' | 'describing';
  error: string;
  /** A save was refused because a project is already there: its path, to be replaced when the person says so. */
  taken: string;
  /** What the model said about what it made. */
  explanation: string;

  /** A document, new or opened: nothing of the one before is left. */
  start: (doc: Windows, from?: { path: string; graph: Graph | null; stale: boolean }) => void;
  /** Change the document by *change*; edits of one *name* in quick succession are one step. */
  edit: (change: (doc: Windows) => Windows, name?: string) => void;
  undo: () => void;
  redo: () => void;
  setValue: (blockId: string, value: unknown) => void;
  show: (patch: Partial<Pick<NotebookState, 'mode' | 'source' | 'window' | 'tab' | 'dockOpen' | 'hot'>>) => void;
  open: (path: string) => Promise<boolean>;
  save: (path: string, replace?: boolean) => Promise<boolean>;
  describe: (description: string) => Promise<boolean>;
  clearError: () => void;
}

const NOTHING_RAN: Done = { ran: new Set<string>(), changed: new Set<string>() };
let coalescing: { name: string; at: number } | null = null;

/**
 * What a window makes depends on what it asks, does and shows -- not on how wide it is, how tall its boxes are, or what it is called on the
 * page. A change of only those leaves what it made standing (widening a window used to wipe its result).
 */
const answers = (windows: Windows['windows']): unknown => windows.map(({ span: _span, title: _title, inputs, outputs, ...rest }) => ({
  ...rest,
  inputs: inputs.map(({ width: _width, rows: _rows, ...one }) => one),
  outputs: outputs.map(({ width: _width, rows: _rows, ...one }) => one),
}));
const sameWindows = (a: Windows, b: Windows): boolean => JSON.stringify(answers(a.windows)) === JSON.stringify(answers(b.windows));

export const useNotebook = create<NotebookState>((set, get) => ({
  doc: null, graph: null, path: '', saved: '', savedAt: 0, stale: false, past: [], future: [], epoch: 0,
  mode: 'write', source: false, window: null, tab: 'cells', dockOpen: false, hot: null,
  values: {}, results: {}, done: NOTHING_RAN, going: [], log: [],
  busy: '', error: '', taken: '', explanation: '',

  start: (opened, from) => {
    coalescing = null;
    // What the page shows is the page the document keeps: the tool that is delivered says the same words.
    const doc = withPage(opened, pageOf(opened));
    set({
      epoch: get().epoch + 1, doc, graph: from?.graph ?? null, path: from?.path ?? '', stale: from?.stale ?? false, saved: from ? JSON.stringify(doc) : '', savedAt: from ? Date.now() : 0,
      past: [], future: [], mode: 'write', source: false, window: null, tab: 'cells', dockOpen: false, hot: null,
      values: {}, results: {}, done: NOTHING_RAN, going: [], log: [], error: '', taken: '', explanation: '',
    });
  },

  edit: (change, name) => {
    const { doc } = get();
    if (!doc) return;
    const next = change(doc);
    if (next === doc) return;
    const now = Date.now();
    const joins = name !== undefined && coalescing?.name === name && now - coalescing.at < COALESCE_MS;
    coalescing = name === undefined ? null : { name, at: now };
    set((state) => ({
      doc: next, future: [],
      past: joins ? state.past : [...state.past, doc].slice(-UNDO_LIMIT),
      // A window that is gone has no cells open.
      window: next.windows.some((one) => one.id === state.window) ? state.window : null,
      // What the windows made answers to the windows as they were; the text of the page changes nothing of it.
      ...(sameWindows(doc, next) ? {} : { results: {}, done: NOTHING_RAN }),
    }));
  },

  undo: () => step('past', 'future'),
  redo: () => step('future', 'past'),

  setValue: (blockId, value) => {
    const { doc, done } = get();
    const window = doc?.windows.find((one) => blockId.startsWith(`${one.id}_in_`));
    set((state) => ({
      values: { ...state.values, [blockId]: value },
      // An input changed after its window ran: the window, and what takes from it, no longer answers to the page.
      ...(window && done.ran.has(window.id) ? { done: { ran: done.ran, changed: new Set([...done.changed, window.id]) } } : {}),
    }));
  },

  show: (patch) => set(patch),

  open: async (path) => {
    set({ busy: 'opening', error: '' });
    try {
      const opened = await call('openWindows', { path });
      if (!opened.windows) {
        set({ error: 'This project was made in the graph editor, not as a notebook, so it does not open here.' });
        return false;
      }
      get().start(opened.windows, { path, graph: opened.graph as unknown as Graph, stale: opened.stale });
      return true;
    } catch (error) {
      set({ error: wordsOf(error, 'The project could not be opened.') });
      return false;
    } finally {
      set({ busy: '' });
    }
  },

  save: async (path, replace = false) => {
    const { doc } = get();
    if (!doc) return false;
    set({ busy: 'saving', error: '', taken: '' });
    try {
      const written = await call('saveWindows', { path, windows: doc, ...(replace ? { replace: true } : {}) });
      set({ path, saved: JSON.stringify(doc), savedAt: Date.now(), stale: false, graph: written.graph as unknown as Graph });
      return true;
    } catch (error) {
      if (error instanceof CallFailed && error.body.taken) set({ taken: path });
      else set({ error: wordsOf(error, 'It could not be saved.') });
      return false;
    } finally {
      set({ busy: '' });
    }
  },

  describe: async (description) => {
    const { doc } = get();
    set({ busy: 'describing', error: '', explanation: '' });
    try {
      // The model is told the windows, not the text around them; it answers with windows, and the text stays.
      const made = await call('describeWindows', { description, ...(doc ? { windows: { ...doc, page: undefined } } : {}) });
      if (doc) get().edit(() => ({ ...made.windows, ...(doc.page ? { page: doc.page } : {}) }));
      else get().start(made.windows);
      set({ explanation: made.explanation, window: null });
      return true;
    } catch (error) {
      set({ error: wordsOf(error, 'The model could not make windows of that.') });
      return false;
    } finally {
      set({ busy: '' });
    }
  },

  clearError: () => set({ error: '', taken: '' }),
}));

/** Undo and redo: the last document of *from* is the document, and the one there was goes onto *to*. */
function step(from: 'past' | 'future', to: 'past' | 'future'): void {
  const { doc } = useNotebook.getState();
  const stack = useNotebook.getState()[from];
  if (!doc || !stack.length) return;
  coalescing = null;
  const target = stack[stack.length - 1];
  useNotebook.setState((state) => ({
    doc: target, [from]: stack.slice(0, -1), [to]: [...state[to], doc],
    // A window that no longer exists has no cells open.
    window: target.windows.some((one) => one.id === state.window) ? state.window : null,
    ...(sameWindows(doc, target) ? {} : { results: {}, done: NOTHING_RAN }),
  }) as Partial<NotebookState>);
}

/** The graph the windows are, made from them now, keeping what a model wrote for the steps that did not change. */
export function compile(doc: Windows, before: Graph | null): Graph {
  return windowsToGraph(doc, before ?? undefined);
}

/** Whether there is something to save: the document is not what was last opened or saved. */
export const isDirty = (state: Pick<NotebookState, 'doc' | 'saved'>): boolean => !!state.doc && JSON.stringify(state.doc) !== state.saved;
