// The session as a page sees it: what its start points were sent, what its
// outputs showed, the round going or gone -- as the server tells it, by name.
//
// One for every page that shows a graph in use -- the delivered tool, the
// editor's App and Page tabs -- fed by the server's stream
// (`GET /api/runtime/stream`): the session on connect and after every change,
// each round as it starts, goes and ends, whoever started it -- this page,
// another tab, the clock.
//
// What a person set on the page and has not sent yet is kept beside it, as
// edits, by block id. A round the page starts takes them along, and they are
// let go of once that round has run to its end and the session keeps them; a
// round that was stopped, or could not start, leaves them where they were --
// the message still in hand.

import { create } from 'zustand';
import { pathFor } from '../../../backend/app/api.ts';
import { call, type RoundSnapshot, type SessionView } from './client';
import { errorText } from './errorText';

export interface PageSession {
  /** The session as the server last told it; none before it has. */
  view: SessionView | null;
  /** The round going now, or the last one -- told as it goes. */
  round: RoundSnapshot | null;
  /** What was set on the page here and not yet kept, by block id. */
  edits: Record<string, unknown>;
  /** What each round in flight was sent, by its id: let go of when it ends. */
  sent: Record<string, Record<string, unknown>>;
}

export const useSession = create<PageSession>(() => ({ view: null, round: null, edits: {}, sent: {} }));

/** Rounds that ended before this page heard what it had sent them: a quick one beats its own answer. */
const endedEarly = new Map<string, boolean>();
/**
 * How many of them are remembered. Every round this page did not start ends
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

/** The stream listened to now. */
let listening: EventSource | null = null;

/**
 * Listen to the session the server holds now, until the returned function is
 * called. Listening again -- the editor handing over another document --
 * replaces what was listened to before.
 */
export function watchSession(): () => void {
  listening?.close();
  const stream = new EventSource(pathFor('stream').path);
  stream.addEventListener('session', (event) => sessionTold(JSON.parse((event as MessageEvent<string>).data) as SessionView));
  stream.addEventListener('round', (event) => roundTold(JSON.parse((event as MessageEvent<string>).data) as RoundSnapshot));
  listening = stream;
  return () => {
    stream.close();
    if (listening === stream) listening = null;
  };
}

/**
 * Another document is open: the session of the one before -- what its blocks
 * showed, what was set on them -- is not this one's. Its own is listened to once
 * it is handed over (`holdDocument`).
 */
export function forgetSession(): void {
  listening?.close();
  listening = null;
  useSession.setState({ view: null, round: null, edits: {}, sent: {} });
}

/** Set block *id* of the page here: shown at once, and sent with the next round the page starts. */
export function setEdit(id: string, value: unknown): void {
  useSession.setState((state) => ({ edits: { ...state.edits, [id]: value } }));
}

/** What block *id* holds as this page shows it: what was set here, else what the session holds, else *design*. */
export function heldValue(state: PageSession, id: string, design: unknown): unknown {
  if (id in state.edits) return state.edits[id];
  if (state.view && id in state.view.page) return state.view.page[id];
  return design;
}

/** Whether a round is going: the page's, another tab's, the clock's. */
export const roundGoing = (state: PageSession): boolean => !!state.round && !state.round.done;

/** What a round is asked with, beside its event: what it is sent, what it asked, who sends it (`RoundRequest`). */
export interface RoundAsk {
  values?: Record<string, unknown>;
  answers?: Record<string, unknown>;
  by?: string;
}

/** How many rounds the server turned down here: each said as a round of its own. */
let refusals = 0;

/** A round the server would not start, as this page saw it: over before it began, for the server's reason -- and what it was to begin with. */
function refused(reason: string, started: RoundSnapshot['started']): RoundSnapshot {
  refusals += 1;
  return {
    round_id: `refused-${refusals}`, done: true, cancelled: false, completed: 0, total: 0, current_label: '',
    item_done: 0, item_total: 0, idle_seconds: null, error: reason, result: null, outputs: null, started,
  };
}

/** Say that a round for *event* could not start, as every failed round is said. */
export function roundRefused(error: unknown, event: string | null, by?: string): void {
  useSession.setState({ round: refused(errorText(error, 'The run could not start.'), event ? { event, by: by ?? 'call' } : null) });
}

/**
 * Start a round for *event* -- the whole graph for none -- asked with *ask*:
 * one the page starts is `by` the block that fired it, and sent what the
 * page set, by block id. One the server turns down -- a name the graph does
 * not offer, another session's id -- is said where every failed round is,
 * and what was set here stays in hand.
 */
export async function startRound(event: string | null, ask: RoundAsk = {}): Promise<void> {
  const values = ask.values ?? {};
  let id: string;
  try {
    ({ round_id: id } = await call('startRound', { event, ...ask }));
  } catch (error) {
    roundRefused(error, event, ask.by);
    return;
  }
  const early = endedEarly.get(id);
  endedEarly.delete(id);
  useSession.setState((state) => (early === undefined
    ? { sent: { ...state.sent, [id]: values } }
    : { edits: early ? kept(state.edits, values) : state.edits }));
}

/**
 * Start over: the session forgets what using the graph left behind -- what
 * its start points were sent, what its memory holds, what the page holds --
 * and so does this page, what was set on it and not sent yet.
 */
export async function startOver(): Promise<void> {
  useSession.setState({ edits: {}, sent: {} });
  try {
    const view = await call('reset', {});
    useSession.setState({ view, round: null });
  } catch (error) {
    useSession.setState({ round: refused(errorText(error, 'It could not start over.'), null) });
  }
}

/** Stop the round going, whoever started it. */
export async function stopRound(): Promise<void> {
  const { round } = useSession.getState();
  if (round && !round.done) await call('stopRound', { id: round.round_id });
}
