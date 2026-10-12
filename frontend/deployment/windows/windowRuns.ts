// Running a window: the ones before it first, each as a round of its own.
//
// What the host does with a window's round is in `gui/windows/order.ts`: it runs the window and
// what it takes from others only as those last were left. So a page of windows starts
// a round for each window that is not current, in order, and waits for each to end before the next
// begins. Which ran with what is kept here, on the page; a reloaded page asks the host again, and the
// host does not ask the model again for what has not changed (it reuses it).

import { create } from 'zustand';
import type { RoundSnapshot } from '../gui/kit/api/client';
import { useSession } from '../gui/kit/api/session';
import { planFor, recorded, type PageWindow, type RunOf } from './windowsInUse';

interface WindowRuns {
  /** What each window was last run with. */
  runs: Record<string, RunOf>;
  /** The windows being run now, in order; none while nothing goes. */
  going: string[];
}

export const useWindowRuns = create<WindowRuns>(() => ({ runs: {}, going: [] }));

/** Another session, or one started over (its count of rounds fell): nothing of what ran is current. */
let heldSession: string | null = null;
let heldRounds = 0;
useSession.subscribe((state) => {
  const view = state.view;
  if (!view) return;
  if (heldSession !== null && (view.session !== heldSession || view.rounds < heldRounds)) forgetRuns();
  heldSession = view.session;
  heldRounds = view.rounds;
});

/** The page is another document, or was started over: nothing of what ran is current. */
export function forgetRuns(): void {
  useWindowRuns.setState({ runs: {}, going: [] });
}

/** How long a start may take to show as a round before it is taken for one that did not start (a question is waiting, say). */
const STARTS_WITHIN_MS = 15_000;

/**
 * The round a start began, over: the first round that is not *previous*, and then the end of it.
 * Null when none began in time.
 */
function roundOver(previous: string | null): Promise<RoundSnapshot | null> {
  return new Promise((over) => {
    let began = false;
    let stop = () => {};
    const timer = setTimeout(() => { if (!began) { stop(); over(null); } }, STARTS_WITHIN_MS);
    const look = (round: RoundSnapshot | null): void => {
      if (!round || round.round_id === previous) return;
      began = true;
      if (!round.done) return;
      clearTimeout(timer);
      stop();
      over(round);
    };
    stop = useSession.subscribe((state) => look(state.round));
    look(useSession.getState().round);
  });
}

/**
 * Whether a round of window *id* ended well: it ran to its end, its graph said success, and no node of the window had nothing
 * to do -- an input left empty is a window that did nothing, and the window after it would only be handed that. The nodes of the
 * other windows are in the round too, standing idle, and are not its business: a node is the window's by its id (`<window>_...`).
 */
export const succeeded = (round: RoundSnapshot, id: string): boolean => !round.cancelled && !round.error && round.result?.status === 'success'
  && !round.result.node_results.some((one) => one.status === 'skipped' && !one.held && (one.node_id === id || one.node_id.startsWith(`${id}_`)));

/**
 * Run window *id* and, before it, every window it needs that is not current.
 *
 * *run* starts a round at a start point, by a block (`useRound().run`); it returns once the round
 * is started, or turned down, or waiting for an answer (*asking* says so, and the chain stops there: the
 * person answers and presses again). Resolves with the windows that were run to their end; a window
 * whose round failed or was stopped ends the chain and is not counted.
 */
export async function runWindows(args: {
  windows: readonly PageWindow[];
  id: string;
  held: (blockId: string) => unknown;
  run: (event: string, by: string) => Promise<void>;
  asking?: () => boolean;
}): Promise<string[]> {
  const { windows, id, held, run, asking } = args;
  if (useWindowRuns.getState().going.length) return [];
  const plan = planFor(windows, useWindowRuns.getState().runs, held, id);
  useWindowRuns.setState({ going: plan });
  const done: string[] = [];
  try {
    for (const one of plan) {
      const window = windows.find((candidate) => candidate.id === one);
      if (!window?.starter) break;
      const before = useSession.getState().round?.round_id ?? null;
      // What its blocks held when it was started: a change made while it runs is for the next round.
      const used = Object.fromEntries(window.inputs.map((blockId) => [blockId, held(blockId)]));
      await run(window.id, window.starter);
      // A question the round waits on is set in the next tick of the page, not before this resumes.
      await new Promise((tick) => setTimeout(tick, 0));
      if (asking?.()) break;
      const ended = await roundOver(before);
      if (!ended || !succeeded(ended, window.id)) break;
      useWindowRuns.setState((state) => ({ runs: recorded(state.runs, window, (blockId) => used[blockId]) }));
      done.push(window.id);
      useWindowRuns.setState({ going: plan.slice(done.length) });
    }
  } finally {
    useWindowRuns.setState({ going: [] });
  }
  return done;
}
