// What the editor tells the person, in one place: saved, opened, failed, written, stopped.
//
// Every one of them used to find its own spot -- a line in the header that went after four
// seconds, a line that stayed, a strip that pushed the page down, a note over the bar below the
// canvas -- so the same kind of thing looked like three. Now there is one: a card in the corner
// that does not move the page. What went well and what is only going on goes by itself after a
// few seconds; a warning and an error stay until they are read, and may carry what to do next.
//
// A notice has a key, and a later one with the same key takes its place: "Saving…" becomes
// "Saved", and a second Save is not a second card. It is of the document it was said in -- another
// one opened leaves it unsaid.

import { create } from 'zustand';
import { useGraphStore } from './graphStore';

export type NoticeLevel = 'done' | 'info' | 'warning' | 'error';

export interface Notice {
  key: string;
  level: NoticeLevel;
  text: string;
  /** The document it was said in (`GraphStore.opened`: not changed by a step into a node's graph and out). */
  document: number;
  /** A button on the card: what to do about it. */
  action?: { label: string; run: () => void };
  /** Stays until read, whatever its level: something still going on. */
  sticky: boolean;
  /** When it was said: a timer for an earlier notice of the same key does not take this one away. */
  at: number;
}

/** How many are shown at once; the oldest that is not a problem goes first. */
const MOST = 4;

/** How long what went well, and what is only said, is shown. */
export const DONE_FOR_MS = 4000;

/** A line as it was written -- ✅ Saved to …, ❌ Save failed, ⚠ Left out … -- as a level and the words without the mark. */
export function parseSaid(said: string): { level: NoticeLevel; text: string } {
  const marks: [RegExp, NoticeLevel][] = [[/^✅\s*/u, 'done'], [/^❌\s*/u, 'error'], [/^⚠️?\s*/u, 'warning'], [/^↻\s*/u, 'info'], [/^✓\s*/u, 'done']];
  for (const [mark, level] of marks) {
    if (mark.test(said)) return { level, text: said.replace(mark, '').trim() };
  }
  return { level: 'info', text: said.trim() };
}

interface NoticeStore {
  notices: Notice[];
  notify: (notice: { key: string; level: NoticeLevel; text: string; action?: Notice['action']; sticky?: boolean }) => void;
  dismiss: (key: string) => void;
}

export const useNotices = create<NoticeStore>()((set) => ({
  notices: [],
  notify: ({ key, level, text, action, sticky }) => set((state) => {
    const made: Notice = {
      key, level, text, action,
      document: useGraphStore.getState().opened,
      sticky: sticky ?? (level === 'warning' || level === 'error'),
      at: Date.now() + Math.random(),
    };
    // What was said in another document is no longer shown, and takes no room from this one's.
    const rest = state.notices.filter((one) => one.key !== key && one.document === made.document);
    // First in, first out: the oldest that is not a problem goes, then the oldest of the problems --
    // and never the one just said, which a full board of problems would otherwise drop at once.
    while (rest.length > MOST - 1) {
      const gone = rest.findIndex((one) => one.level !== 'error' && one.level !== 'warning');
      rest.splice(gone < 0 ? 0 : gone, 1);
    }
    return { notices: [...rest, made] };
  }),
  dismiss: (key) => set((state) => ({ notices: state.notices.filter((one) => one.key !== key) })),
}));

/** Say something: *text* may start with a mark (✅ ❌ ⚠ ↻) that sets its level. An empty one takes the notice of that key away. */
export function say(key: string, text: string, options: { level?: NoticeLevel; action?: Notice['action']; sticky?: boolean } = {}): void {
  const { notify, dismiss } = useNotices.getState();
  if (!text.trim()) {
    dismiss(key);
    return;
  }
  const parsed = parseSaid(text);
  // Still going on -- "Saving…" -- is said until something replaces it.
  const going = /…$/u.test(parsed.text);
  notify({ key, level: options.level ?? parsed.level, text: parsed.text, action: options.action, sticky: options.sticky ?? (going ? true : undefined) });
}
