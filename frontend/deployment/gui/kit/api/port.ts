// The built-in GUI's end of the GUI port (`backend/deployment/host/port.ts`, "The GUI port" in docs/architecture.md).
//
// The page meets its tool at connection points, and this is where the GUI says what it does there, in two halves that know nothing of each
// other: *start* is what the page does to the tool (ask what a round still needs, begin it, stop it, start over); *return* is what the tool
// tells the page (the session now, and every round as it goes -- whoever began it). The GUI's store (`session.ts`) is fed by the return half
// and its actions (`start.ts`) use the start half; neither reaches the wire any other way. So the transport is one thing to replace: a
// site embedding the GUI, a test, a recording can plug in a port of its own (`setPort`), and a page written by hand uses the same points
// through `/tw/port.js` (`backend/deployment/host/port.js`).

import { API, pathFor } from '../../../../../backend/deployment/host/api.ts';
import { call, type ChatContext, type Requirement, type RoundSnapshot, type SessionView } from './client';

/** What a round is asked with, beside its event: what it is sent, what it asked, who sends it (`RoundRequest`). */
export interface RoundAsk {
  values?: Record<string, unknown>;
  answers?: Record<string, unknown>;
  by?: string;
}

/** What the page does to the tool. */
export interface StartPort {
  /** What a round for *event* still needs before it runs: the "before running" questions. */
  requirements(event: string | null, ask: RoundAsk): Promise<Requirement[]>;
  /** Begin a round at *event* -- the whole graph for none -- and say its id at once; its answer comes back on the return half. */
  start(event: string | null, ask: RoundAsk): Promise<{ round_id: string }>;
  stop(id: string): Promise<void>;
  /** Start over: the tool forgets what using it left behind, and says what it is now. */
  reset(): Promise<SessionView>;
}

/** What the tool tells the page. */
export interface ReturnPort {
  /** The session now, as the tool tells it. */
  session(): Promise<SessionView>;
  /** Hear the session after every change and each round as it goes; returns how to stop. */
  watch(on: { session: (view: SessionView) => void; round: (round: RoundSnapshot) => void }): () => void;
}

/** What the page asks of the tool's model besides a round. */
export interface ModelPort {
  /** The window of the model the tool runs on, and how that is known. */
  context(): Promise<ChatContext>;
  /** The oldest turns of a conversation, with the summary there is already, shortened into one summary: one call to the model. */
  compact(summary: string, messages: { role: string; text: string }[]): Promise<string>;
}

export interface GuiPort {
  start: StartPort;
  back: ReturnPort;
  model: ModelPort;
}

/** The port over HTTP, as every tool answers it: the routes of the runtime API, called by name, and its stream. */
export const httpPort: GuiPort = {
  start: {
    requirements: (event, ask) => call('requirements', { event, ...ask }),
    start: (event, ask) => call('startRound', { event, ...ask }),
    stop: async (id) => { await call('stopRound', { id }); },
    reset: () => call('reset', {}),
  },
  model: {
    context: () => call('chatContext', {}),
    compact: async (summary, messages) => (await call('compactChat', { summary, messages })).summary,
  },
  back: {
    session: () => call('session', {}),
    watch({ session, round }) {
      const stream = new EventSource(pathFor(API.stream).path);
      stream.addEventListener('session', (event) => session(JSON.parse((event as MessageEvent<string>).data) as SessionView));
      stream.addEventListener('round', (event) => round(JSON.parse((event as MessageEvent<string>).data) as RoundSnapshot));
      return () => stream.close();
    },
  },
};

let current: GuiPort = httpPort;

/** The port the GUI is using now. */
export const port = (): GuiPort => current;

/** Use *next* from now on, or the HTTP one again; returns the one it replaced. */
export function setPort(next: GuiPort = httpPort): GuiPort {
  const before = current;
  current = next;
  return before;
}
