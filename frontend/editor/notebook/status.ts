// Where a window stands, in a word, for the chip on it and the status of its cells.

import { currentWindows, type Window } from '../../../gui/editor/windows/windows.ts';
import { stepNode } from '../../../gui/editor/windows/windows.ts';
import type { NotebookState } from './store';

export type WindowState = 'ready' | 'running' | 'waiting' | 'done' | 'stale' | 'empty' | 'failed' | 'stopped';

export const STATE_WORDS: Record<WindowState, string> = {
  ready: 'Ready', running: 'Running…', waiting: 'Waiting', done: 'Done', stale: 'Out of date', empty: 'Nothing to do', failed: 'Failed', stopped: 'Stopped',
};

type Seen = Pick<NotebookState, 'doc' | 'going' | 'results' | 'done'>;

export function windowState(s: Seen, id: string): WindowState {
  const at = s.going.indexOf(id);
  if (at === 0) return 'running';
  if (at > 0) return 'waiting';
  const result = s.results[id];
  if (!result) return 'ready';
  if (result.outcome !== 'done') return result.outcome;
  return s.doc && currentWindows(s.doc, s.done).has(id) ? 'done' : 'stale';
}

/** The class that colours a chip: a window waiting looks like one running. */
export const chipClass = (state: WindowState): string => (state === 'waiting' ? 'running' : state);

/** What a node of a step did the last time its window ran, in a word -- or nothing, before it ran. */
export function stepStatus(s: Pick<NotebookState, 'results'>, window: Window, at: number): { word: string; kind: string } {
  const node = s.results[window.id]?.nodes[stepNode(window, window.steps[at])];
  if (!node) return { word: '', kind: '' };
  if (node.status === 'error') return { word: 'failed', kind: 'failed' };
  if (node.status === 'skipped' && !node.held) return { word: 'nothing to do', kind: 'empty' };
  return { word: node.reused ? 'done, as before' : 'done', kind: '' };
}

/**
 * Whether the page is kept, for the bar on top: a page that was never saved, one changed after it was, or one that is as saved.
 * *at* is a time, as `Date.now()` gives it.
 */
export function saveNote(s: { path: string; dirty: boolean; savedAt: number }): { kind: 'new' | 'changed' | 'saved'; words: string } {
  const time = s.savedAt ? new Date(s.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  if (!s.path) return { kind: 'new', words: s.dirty ? 'Not saved yet' : '' };
  if (s.dirty) return { kind: 'changed', words: `Changed since you saved it${time ? ` at ${time}` : ''}` };
  return { kind: 'saved', words: `Saved${time ? ` at ${time}` : ''}` };
}
