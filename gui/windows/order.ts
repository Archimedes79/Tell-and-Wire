// Which windows to run, and in what order.
//
// A round of a window runs the window and, for what it takes from another, the
// other's last answer -- not the other window as it stands now. A window that
// never ran has no answer, so a round of the one after it brings back nothing
// and says success; a window whose input was changed and not run again hands
// on the answer to the input it had. So whoever runs a window runs first the
// ones before it that are not current, one round each, in order
// (`backend/deployment/host/session.ts` holds the reason: a round is sent the
// blocks of the start point it begins at, and no other's).
//
// Neutral and carried by a package: the page a deployed tool serves runs its
// windows by this, and the editor's model of a window (`gui/notebook`)
// by the same, so they cannot disagree about what is current.

/** A window as the order sees it: its id, and the windows it takes something from. */
export interface Linked {
  id: string;
  after: readonly string[];
}

/** What a person has done to the windows since they last ran: which ran at all, and which had an input changed after. */
export interface Done {
  ran: ReadonlySet<string>;
  changed: ReadonlySet<string>;
}

/** The windows whose last answer is still the answer to what is on the page: ran, nothing changed since, and so for every window they take from. */
export function currentWindows(windows: readonly Linked[], done: Done): Set<string> {
  const after = new Map(windows.map((window) => [window.id, window.after]));
  const current = new Map<string, boolean>();
  const check = (id: string): boolean => {
    if (!current.has(id)) {
      current.set(id, false); // a window waiting for itself is never current
      current.set(id, done.ran.has(id) && !done.changed.has(id) && (after.get(id) ?? []).map(check).every(Boolean));
    }
    return current.get(id)!;
  };
  windows.forEach((window) => check(window.id));
  return new Set([...current].filter(([, is]) => is).map(([id]) => id));
}

/**
 * The windows to run, in the order to run them, so that *id* answers to what
 * is on the page: the ones before it that are not current, each followed by
 * everything that takes from it on the way, and *id* last.
 */
export function runOrder(windows: readonly Linked[], id: string, done: Done): string[] {
  const after = new Map(windows.map((window) => [window.id, window.after]));
  const current = currentWindows(windows, done);
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (one: string): boolean => {
    if (seen.has(one)) return order.includes(one);
    seen.add(one);
    // Every window before it is visited, however the earlier ones came out.
    const behind = (after.get(one) ?? []).map(visit);
    const runs = one === id || !current.has(one) || behind.some(Boolean);
    if (runs) order.push(one);
    return runs;
  };
  visit(id);
  return order;
}

/** *done* after the person changed an input of window *id*: it no longer answers to what is on the page, and nothing that takes from it does. */
export function afterEdit(done: Done, id: string): Done {
  return { ran: done.ran, changed: new Set([...done.changed, id]) };
}

/** *done* after window *id* ran: it is current again, and everything that takes from it has not yet seen its new answer. */
export function afterRun(windows: readonly Linked[], done: Done, id: string): Done {
  const changed = new Set(done.changed);
  changed.delete(id);
  const behind = [id];
  for (const one of behind) {
    for (const window of windows) {
      if (window.after.includes(one) && !behind.includes(window.id)) { behind.push(window.id); changed.add(window.id); }
    }
  }
  return { ran: new Set([...done.ran, id]), changed };
}
