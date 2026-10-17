// The session as a GUI sees it: what its start points were sent, what its
// outputs showed, the round going or gone -- as the server tells it, by name.
//
// One for every GUI that shows a graph in use -- the delivered tool, the
// editor's App and GUI tabs -- fed by the server's stream
// (`GET /api/runtime/stream`): the session on connect and after every change,
// each round as it starts, goes and ends, whoever started it -- this GUI,
// another tab, the clock.
//
// What a person set on the GUI and has not sent yet is kept beside it, as
// edits, by block id. A round the GUI starts takes them along, and they are
// let go of once that round has run to its end and the session keeps them; a
// round that was stopped, or could not start, leaves them where they were --
// the message still in hand.

import { create } from 'zustand';
import type { RoundSnapshot, SessionView } from './client';
import { errorText } from './errorText';
import { port } from './port';

export interface GuiSession {
  /** The session as the server last told it; none before it has. */
  view: SessionView | null;
  /** The round going now, or the last one -- told as it goes. */
  round: RoundSnapshot | null;
  /** What was set on the GUI here and not yet kept, by block id. */
  edits: Record<string, unknown>;
  /** What each round in flight was sent, by its id: let go of when it ends. */
  sent: Record<string, Record<string, unknown>>;
}

export const useSession = create<GuiSession>(() => ({ view: null, round: null, edits: {}, sent: {} }));

/** Rounds that ended before this GUI heard what it had sent them: a quick one beats its own answer. */
const endedEarly = new Map<string, boolean>();
/**
 * How many of them are remembered. Every round this GUI did not start ends
 * "early" too -- the clock's, another tab's -- and only the last few can still
 * be one whose start is on its way back here.
 */
const ENDED_EARLY_KEPT = 16;

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Let go of what *sent* gave, now that its round ran to its end: unless it was set again since. */
function kept(edits: Record<string, unknown>, sent: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(edits).filter(([name, value]) => !(name in sent) || !same(sent[name], value)));
}

function sessionTold(view: SessionView): void {
  useSession.setState((state) => ({
    view,
    round: view.round ?? state.round,
    // Another session -- another document, or a server started anew: what was
    // set for the one before is not this one's.
    ...(state.view && state.view.session !== view.session ? { edits: {}, sent: {} } : {}),
  }));
}

function roundTold(round: RoundSnapshot): void {
  useSession.setState((state) => {
    if (!round.done) return { round };
    const ranToItsEnd = !round.cancelled && round.result !== null;
    const sent = state.sent[round.round_id];
    if (!sent) {
      endedEarly.set(round.round_id, ranToItsEnd);
      if (endedEarly.size > ENDED_EARLY_KEPT) endedEarly.delete(endedEarly.keys().next().value!);
      return { round };
    }
    const { [round.round_id]: _ended, ...going } = state.sent;
    return { round, sent: going, edits: ranToItsEnd ? kept(state.edits, sent) : state.edits };
  });
}

/** How to stop listening to what is listened to now. */
let listening: (() => void) | null = null;

/**
 * Listen to the session the server holds now, until the returned function is
 * called. Listening again -- the editor handing over another document --
 * replaces what was listened to before.
 */
export function watchSession(): () => void {
  listening?.();
  const stop = port().back.watch({ session: sessionTold, round: roundTold });
  listening = stop;
  return () => {
    stop();
    if (listening === stop) listening = null;
  };
}

/**
 * Another document is open: the session of the one before -- what its blocks
 * showed, what was set on them -- is not this one's. Its own is listened to once
 * it is handed over (`holdDocument`).
 */
export function forgetSession(): void {
  listening?.();
  listening = null;
  useSession.setState({ view: null, round: null, edits: {}, sent: {} });
}

/** Set block *id* of the GUI here: shown at once, and sent with the next round the GUI starts. */
export function setEdit(id: string, value: unknown): void {
  useSession.setState((state) => ({ edits: { ...state.edits, [id]: value } }));
}

/** What block *id* holds as this GUI shows it: what was set here, else what the session holds, else *design*. */
export function heldValue(state: Pick<GuiSession, 'view' | 'edits'>, id: string, design: unknown): unknown {
  if (id in state.edits) return state.edits[id];
  if (state.view && id in state.view.gui) return state.view.gui[id];
  return design;
}

/** Whether a round is going: the GUI's, another tab's, the clock's. */
export const roundGoing = (state: GuiSession): boolean => !!state.round && !state.round.done;

/** How many rounds the server turned down here: each said as a round of its own. */
let refusals = 0;

/** A round the server would not start, as this GUI saw it: over before it began, for the server's reason -- and what it was to begin with. */
function refused(reason: string, started: RoundSnapshot['started']): RoundSnapshot {
  refusals += 1;
  return {
    round_id: `refused-${refusals}`, done: true, cancelled: false, completed: 0, total: 0, current_label: '', running: [], finished: {},
    item_done: 0, item_total: 0, idle_seconds: null, error: reason, result: null, outputs: null, started,
  };
}

/** Say that a round for *event* could not start, as every failed round is said. *fallback*: the words where the failure has none. */
export function roundRefused(error: unknown, event: string | null, by?: string, fallback = 'The run could not start.'): void {
  useSession.setState({ round: refused(errorText(error, fallback), event ? { event, by: by ?? 'call' } : null) });
}

/**
 * Round *id* was started here, sent *values*: what was set on the GUI is let go of once the round has run to its end and the session
 * keeps it. A round that already ended before this was told (a quick one beats its own answer) is settled at once.
 */
export function roundStarted(id: string, values: Record<string, unknown>): void {
  const early = endedEarly.get(id);
  endedEarly.delete(id);
  useSession.setState((state) => (early === undefined
    ? { sent: { ...state.sent, [id]: values } }
    : { edits: early ? kept(state.edits, values) : state.edits }));
}

/** What was set on this GUI and not sent, and what rounds were sent, is forgotten: the tool started over. */
export function forgetEdits(): void {
  useSession.setState({ edits: {}, sent: {} });
}

/** The tool started over and told the session it is now. */
export function sessionReset(view: SessionView): void {
  useSession.setState({ view, round: null });
}
