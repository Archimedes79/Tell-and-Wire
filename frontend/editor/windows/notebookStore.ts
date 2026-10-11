// The notebook that is open: the windows, where they are kept, what was done to them (undo), and the three
// things asked of the server -- open, save, and ✨ describe.
//
// The windows are the document; the graph they compile to is made again from them whenever it is needed
// (`compile`) and only held, never edited. What a model wrote for a cell (prompt, code) stays with the graph
// that was last made or opened, so a window changed in another place does not lose the writing of the cells
// that did not change (`windowsToGraph`'s `before`).

import { create } from 'zustand';
import { ApiError, call, watchGeneration, type AICall } from '../api/client';
import { forgetSession, useSession, watchSession } from '../../deployment/gui/kit/api/session';
import { errorText } from '../../deployment/gui/kit/api/errorText';
import { windowsToGraph, type Windows } from '../../../gui/editor/windows/windows.ts';
import { withoutWriting } from '../../../graph/editor/handedOn.ts';
import type { Graph } from '../../../graph/graph.ts';

/** How many steps back undo goes. A page is a few kilobytes, so each step is the whole document. */
export const UNDO_LIMIT = 100;
/** Edits of one name closer together than this are one undo step: a sentence typed is not forty. */
const COALESCE_MS = 1500;

export interface NotebookState {
  doc: Windows | null;
  /** The graph the windows were last compiled to, or opened with: where what a model wrote for a cell is kept. */
  graph: Graph | null;
  /** Where the project is kept; none while it is new. */
  path: string;
  /** The document as it was last opened or saved, to say whether there is something to save. */
  saved: string;
  /** The graph on disk was changed by something else after the windows made it. */
  stale: boolean;
  /** The window opened beside its cells; none, the page. */
  selected: string | null;
  past: Windows[];
  future: Windows[];
  busy: '' | 'opening' | 'saving' | 'describing';
  /** The requests a ✨ has sent so far, while it works. */
  calls: AICall[];
  error: string;
  /** A save was refused because a project is already there: its path, to be replaced when the person says so. */
  taken: string;
  /** What ✨ said about what it made. */
  explanation: string;

  /** A document of windows, new: nothing is kept for it yet. */
  start: (doc: Windows, from?: { path: string; graph: Graph | null; stale: boolean }) => void;
  /** Change the document by *change*; edits of one *name* in quick succession are one step. */
  edit: (change: (doc: Windows) => Windows, name?: string) => void;
  undo: () => void;
  redo: () => void;
  select: (id: string | null) => void;
  open: (path: string) => Promise<void>;
  save: (path: string, replace?: boolean) => Promise<boolean>;
  describe: (description: string) => Promise<boolean>;
  clearError: () => void;
}

let coalescing: { name: string; at: number } | null = null;

/** The session this editor handed the compiled windows to, and the one the server says it holds. */
let heldSession: string | null = null;
let stopWatching: (() => void) | null = null;

export const useNotebook = create<NotebookState>((set, get) => ({
  doc: null, graph: null, path: '', saved: '', stale: false, selected: null,
  past: [], future: [], busy: '', calls: [], error: '', taken: '', explanation: '',

  start: (doc, from) => {
    coalescing = null;
    heldSession = null;
    stopWatching?.();
    stopWatching = null;
    forgetSession();
    set({
      doc, graph: from?.graph ?? null, path: from?.path ?? '', stale: from?.stale ?? false,
      saved: from ? JSON.stringify(doc) : '', selected: null, past: [], future: [], error: '', taken: '', explanation: '',
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
    }));
  },

  undo: () => {
    const { doc, past, future } = get();
    if (!doc || !past.length) return;
    coalescing = null;
    const target = past[past.length - 1];
    // A window that no longer exists is not left open.
    set((state) => ({
      doc: target, past: past.slice(0, -1), future: [...future, doc],
      selected: target.windows.some((window) => window.id === state.selected) ? state.selected : null,
    }));
  },

  redo: () => {
    const { doc, past, future } = get();
    if (!doc || !future.length) return;
    coalescing = null;
    const target = future[future.length - 1];
    set((state) => ({
      doc: target, future: future.slice(0, -1), past: [...past, doc],
      selected: target.windows.some((window) => window.id === state.selected) ? state.selected : null,
    }));
  },

  select: (id) => set({ selected: id }),

  open: async (path) => {
    set({ busy: 'opening', error: '' });
    try {
      const opened = await call('openWindows', { path });
      if (!opened.windows) {
        set({ error: 'This project was made in the graph editor, not as a page of windows, so it does not open here.' });
        return;
      }
      get().start(opened.windows, { path, graph: opened.graph as unknown as Graph, stale: opened.stale });
    } catch (error) {
      set({ error: errorText(error, 'The project could not be opened.') });
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
      set({ path, saved: JSON.stringify(doc), stale: false, graph: written.graph as unknown as Graph });
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.body.taken) set({ taken: path });
      else set({ error: errorText(error, 'It could not be saved.') });
      return false;
    } finally {
      set({ busy: '' });
    }
  },

  describe: async (description) => {
    const { doc } = get();
    set({ busy: 'describing', error: '', calls: [], explanation: '' });
    try {
      const made = await watchGeneration(
        (progress) => call('describeWindows', { description, ...(doc ? { windows: doc } : {}), progress_id: progress }),
        (calls) => set({ calls }),
      );
      if (doc) get().edit(() => made.windows);
      else get().start(made.windows);
      set({ explanation: made.explanation, selected: null });
      return true;
    } catch (error) {
      set({ error: errorText(error, 'The model could not make windows of that.') });
      return false;
    } finally {
      set({ busy: '' });
    }
  },

  clearError: () => set({ error: '', taken: '' }),
}));

/** The graph the windows are, made from them now. Kept with what a model wrote for the cells that did not change. */
export function compile(doc: Windows, before: Graph | null): Graph {
  return windowsToGraph(doc, before ?? undefined);
}

/**
 * Hand the windows, as the graph they are, to the server's session -- so a round runs what is on the page --
 * and listen to that session. Once per round; the server keeps the session while the graph holds.
 */
export async function holdWindows(): Promise<void> {
  const { doc, graph, path } = useNotebook.getState();
  if (!doc) return;
  const made = compile(doc, graph);
  const { session } = await call('holdGraph', { graph: withoutWriting(made as never) as never, path: path || null, session: heldSession });
  useNotebook.setState({ graph: made });
  if (session !== heldSession) {
    heldSession = session;
    stopWatching?.();
    stopWatching = watchSession();
  }
}

/** Whether there is something to save: the document is not what was last opened or saved. */
export const isDirty = (state: Pick<NotebookState, 'doc' | 'saved'>): boolean => !!state.doc && JSON.stringify(state.doc) !== state.saved;

/** The round going now, if any: only the session says. */
export const roundIsGoing = (): boolean => {
  const { round } = useSession.getState();
  return !!round && !round.done;
};
