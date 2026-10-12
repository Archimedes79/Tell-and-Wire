// The wire between a GUI and the server: the host's routes, and what travels each way.
//
// Two processes talk over HTTP -- Node runs graphs, the browser draws them --
// and a conversation described twice, once by the server's replies and once by
// what the GUI expects, drifts apart unnoticed.
//
// So this file is the conversation, once. The server serves exactly these tables
// (`serve.ts` fails to start if a route has no handler), a GUI calls them by
// name (`frontend/deployment/gui/kit/api/client.ts`), and both are type-checked against the same
// request and response here. Types and plain tables only -- nothing that
// needs Node or a browser -- so either side can import it, and a package, which
// carries it, pays for a list.
//
// Three tables, each with the module that answers it: `API` here (what any host answers: a graph
// used by name), `GUI_API` here too (the GUI's own read, answered when the tool has a gui), and
// `EDITOR_API` in `backend/editor/host/api.ts` (what only the editor serves). A server holds the
// tables it was composed of (`backend/cli`); a route of another table is a 404. A `local` route
// is also refused by a server bound wider than loopback.

import type { ExecutionResult } from '../../../graph/graph.ts';
import type { GraphInterface } from '../../../graph/interface.ts';
import type { RuntimeRequirement } from '../../../gui/widgets/WidgetDefinition.ts';

// ---------------------------------------------------------------------------
// What travels
// ---------------------------------------------------------------------------

/**
 * A round in flight, as a watching gui sees it.
 *
 * `completed/total` counts nodes, which does not move while one node grinds
 * through a 500-item batch or one long model call; `item_done/item_total` and
 * `idle_seconds` are what move then -- the two cases that look like a hang.
 */
export interface RoundSnapshot {
  round_id: string;
  done: boolean;
  cancelled: boolean;
  completed: number;
  total: number;
  current_label: string;
  /** The nodes working now, by id: more than one where a column runs in any order. */
  running: string[];
  /** How the nodes that have finished in this round went, by id, while it goes: the canvas shows each as it is done, and the whole result once it has ended. */
  finished: Record<string, string>;
  item_done: number;
  item_total: number;
  /** Seconds since the running node last showed life; null before anything reported. */
  idle_seconds: number | null;
  error: string | null;
  result: ExecutionResult | null;
  /** What it handed back by name, once it has ended: the graph's outputs (`graph/interface.ts`). */
  outputs: Record<string, unknown> | null;
  /**
   * What began it: the start point it fired, and who sent it -- a block of the
   * gui by its id, or one of `SENDERS` -- or null for a round of the whole
   * graph, whose result is all there is rather than a part laid over the rest.
   */
  started: RoundStart | null;
}

/** What began a round: the start point, by its name, and who sent what it was sent. */
export interface RoundStart {
  event: string;
  by: string;
}

/**
 * What a frontend is told of the session: the values each name holds now,
 * what each output showed last, and the round going or gone. By name, never
 * by node -- the round's `result` aside, which the editor reads.
 */
export interface SessionView {
  session: string;
  /** What each start point was sent last, by its name: the values of the last round it began, else its design's. */
  sent: Record<string, unknown>;
  /** What each end point handed back last, by its name, laid over from every round. */
  outputs: Record<string, unknown>;
  /**
   * What each memory node holds, by its name -- its whole content: every field
   * -- and each part of it by the name and the part
   * (`counter.clicks`): what the last round that ran to its end left, from
   * the design's values on, never a round half done. Watched without a round:
   * a block of the GUI can show it, a script read it.
   */
  state: Record<string, unknown>;
  /**
   * What each block of the GUI holds now, by the block's id: what was typed
   * or chosen, a conversation, what an end point handed back -- else its
   * design. Beside `sent`, not in it: a block and a start point may share a name.
   */
  gui: Record<string, unknown>;
  /** What each block of the GUI that shows an end point shows, by the block's id: what arrived, as the GUI draws it. */
  shown: Record<string, unknown>;
  /**
   * What using the graph left that differs from its design -- what Start over
   * forgets: each node's values by node id and name (a data node's fields,
   * what a start point was sent), and what each block of the GUI
   * holds, by id.
   */
  kept: { nodes: Record<string, Record<string, unknown>>; gui: Record<string, unknown> };
  /** How many rounds have run to their end, and when the last did. */
  rounds: number;
  finished_at: number | null;
  /** The round going now, or the last one. */
  round: RoundSnapshot | null;
  /** What opening the session, or handing it a graph, dropped of what it kept: said once, in words. */
  dropped: string[];
  /** Which design this is, counted from 0: a GUI drawn from the design is drawn again when it changes. */
  design_revision: number;
  /** The graph's own clock (its start points that start themselves), which the server keeps while the application runs. */
  clock: ClockView;
}

/** The clock a session keeps: whether it runs, whether it ticks, and when the next round is due. */
interface ClockView {
  running: boolean;
  /** Something starts it by itself: a start point starts when the tool starts, or keeps time. */
  runs_by_itself: boolean;
  /** A start point keeps time: something is left to happen once the tool has started. */
  ticks: boolean;
  next_at: number | null;
  /** Why an interval could not be read, while one cannot: that start point keeps no time. */
  problem: string | null;
}

/**
 * The GUI a tool shows, as the built-in GUI draws it: the graph's name and
 * scheme, its blocks as they were designed -- what each holds now is the
 * session's (`SessionView.gui`) -- and whether opening it runs the graph
 * whole, as a program runs when it is started: nothing on the GUI or in a
 * start point of its own starts it otherwise (`startEvents`).
 */
export interface GuiView {
  session: string;
  /** Which design of the session this GUI is: see SessionView.design_revision. */
  design_revision: number;
  name: string;
  description: string;
  scheme: string;
  blocks: Record<string, unknown>[];
  starts_whole: boolean;
  /** Running it asks a model somewhere: the delivered tool offers its AI settings only then. */
  uses_model: boolean;
}

/** What the graph offers whoever uses it, by name -- and which session that is. */
interface InterfaceView extends GraphInterface {
  session: string;
  name: string;
  description: string;
}

/**
 * A round asked for by name: the event that starts it -- none, the whole
 * graph -- and the values it is given. A start point takes the values as its
 * package, under the sender's names.
 */
interface RoundRequest {
  /** The session asked about; this server's, when left out. */
  session?: string;
  event?: string | null;
  /**
   * What the round is sent: for a round the GUI starts (*by* a block), what
   * its blocks hold, by block id; for another round of a start point, its
   * package's values under names of the sender's own. A round of the whole
   * graph is sent nothing.
   */
  values?: Record<string, unknown>;
  /** What `requirements` asked of a round the GUI starts, answered under the keys it asked with: the blocks' ids. */
  answers?: Record<string, unknown>;
  /** Who sends it, as the package says: a block of the GUI by its id. A script leaves it out, and is a "call". */
  by?: string;
}

/** What a round handed back, once it ended: what `runRound` answers. */
interface RoundOutcome {
  session: string;
  round_id: string;
  status: ExecutionResult['status'];
  error: string | null;
  outputs: Record<string, unknown>;
}

/** A question about the session: this server's, when it names none. */
export interface InSession {
  session?: string;
}

/**
 * A path a round the GUI starts needs before it can run, as the "before
 * running" dialog asks for it: the backend's own question, keyed by the block
 * that answers it, so no end takes the key apart or builds it again.
 */
export type Requirement = RuntimeRequirement;

/** `project`: a folder with a `graph-flow.json` in it, which opens rather than being walked into. */
export interface BrowseEntry { name: string; path: string; is_dir: boolean; project?: boolean }

/**
 * One directory, for a picker -- on this machine only: it is for the person at the keyboard.
 * `project`: the directory shown is a project itself.
 */
export interface BrowsePage { path: string; parent: string | null; entries: BrowseEntry[]; roots: string[]; project?: boolean; /** The folder shown is the program's own, or in it. */ program?: boolean }

/** Which model a deployed tool calls, and whether `ai-settings.json` is there; where it is stays on the machine. Read-only: see the route. */
export interface ToolAiSettings {
  provider: string;
  model: string;
  settings_file_exists: boolean;
}

/** A failed call's body: its `detail`, and whatever more the route that failed had to say. */
export interface Failure { detail: string; [more: string]: unknown }

// ---------------------------------------------------------------------------
// The routes
// ---------------------------------------------------------------------------

type Method = 'GET' | 'POST';

/** A route as the server and the client read it: how it is asked, and where. */
interface AnyRoute {
  method: Method;
  /** `:name` segments are path parameters, handed over as `name`. */
  path: string;
  /**
   * Answered only by a server bound to this machine (loopback): it looks at
   * the machine's files or starts a program for the person at the keyboard.
   * `serve.ts` refuses it otherwise, for every route and nowhere else.
   */
  local?: true;
}

/**
 * One route. `Req` is everything the handler is handed -- the JSON body, the
 * query and `:params`, merged into one object -- and `Res` what it answers.
 * The two type parameters exist only for the compiler; at run time a route is
 * its method and path.
 */
interface Route<Req, Res> extends AnyRoute {
  /** Phantom: carries the types, never set. */
  readonly types?: { request: Req; response: Res };
}

/** A table of routes, by the name they are called by. */
export type Routes = Record<string, AnyRoute>;

export type RequestOf<R> = R extends { readonly types?: { request: infer Req } } ? Req : never;
export type ResponseOf<R> = R extends { readonly types?: { response: infer Res } } ? Res : never;

export function route<Req, Res>(method: Method, path: string): Route<Req, Res> {
  return { method, path };
}

/** *one*, answered on this machine only. */
export function local<Req, Res>(one: Route<Req, Res>): Route<Req, Res> {
  return { ...one, local: true };
}

/** What any host answers: a graph used by name, by any frontend. */
export const API = {
  /** What the graph offers by name: its start points -- each with what the graph reads of what it is sent -- and its end points. */
  interface: route<InSession, InterfaceView>('GET', '/api/runtime/interface'),

  /** The session now: what each start point was sent, what the outputs showed, the GUI, the round going or gone, the clock. */
  session: route<InSession, SessionView>('GET', '/api/runtime/session'),

  /**
   * Server-sent events, not JSON: `session` once on connect and after every
   * change, `round` as each round starts, goes and ends -- the GUI's, a
   * clock's, another tab's. Read with an `EventSource`.
   */
  stream: route<InSession, never>('GET', '/api/runtime/stream'),

  /** What a round for this event still needs before it runs, given these values: the "before running" questions. */
  requirements: route<RoundRequest, Requirement[]>('POST', '/api/runtime/requirements'),

  /** Start a round, and watch it by its id. */
  startRound: route<RoundRequest, { session: string; round_id: string; total: number }>('POST', '/api/runtime/rounds'),

  round: route<InSession & { id: string }, RoundSnapshot>('GET', '/api/runtime/rounds/:id'),

  stopRound: route<InSession & { id: string }, { stopped: boolean }>('POST', '/api/runtime/rounds/:id/stop'),

  /** Run a round and answer once it has ended: a function call. */
  runRound: route<RoundRequest, RoundOutcome>('POST', '/api/runtime/run'),

  /** Forget what using the graph left behind: it is as designed again. */
  reset: route<InSession, SessionView>('POST', '/api/runtime/reset'),

  /** Which model the tool calls. Read-only: a recipient configures it in a file, not in a GUI. */
  toolAiSettings: route<void, ToolAiSettings>('GET', '/api/runtime/ai-settings'),

  /** Listing directories is for the person at the keyboard. */
  browse: local(route<{ path: string; extensions?: string }, BrowsePage>('POST', '/api/files/browse')),
} as const;

/** What a host with a GUI answers besides: the GUI as it was designed. */
export const GUI_API = {
  /** The GUI as it was designed: what the built-in GUI draws, by the names its blocks are called. */
  gui: route<InSession, GuiView>('GET', '/api/runtime/gui'),
} as const;

/**
 * Match a request against the tables: which route, and its `:params`.
 *
 * Here rather than in the server because it is the tables' own rule -- how a
 * path with parameters is read -- and the GUI's client writes paths by the
 * inverse of it (`pathFor`).
 */
export function matchRoute(api: Routes, method: string, path: string): { name: string; params: Record<string, string> } | null {
  for (const [name, candidate] of Object.entries(api)) {
    if (candidate.method !== method) continue;
    const params = matchPath(candidate.path, path);
    if (params) return { name, params };
  }
  return null;
}

/** The concrete path for a route, with its `:params` filled in from the request. */
export function pathFor(one: AnyRoute, request: Record<string, unknown> = {}): { path: string; rest: Record<string, unknown> } {
  const rest = { ...request };
  const path = one.path.replace(/:([a-z_]+)/g, (_, key: string) => {
    const value = rest[key];
    delete rest[key];
    return encodeURIComponent(String(value ?? ''));
  });
  return { path, rest };
}

function matchPath(pattern: string, path: string): Record<string, string> | null {
  const want = pattern.split('/');
  const got = path.split('/');
  if (want.length !== got.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < want.length; i++) {
    if (want[i].startsWith(':')) {
      // A broken escape (`%E0%A4%A`) is a path that names nothing, not a server that broke.
      try {
        params[want[i].slice(1)] = decodeURIComponent(got[i]);
      } catch {
        return null;
      }
    } else if (want[i] !== got[i]) return null;
  }
  return params;
}
