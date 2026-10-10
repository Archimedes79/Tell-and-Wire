// The wire between the page and the server: every route, and what travels each way.
//
// Two processes talk over HTTP -- Node runs graphs, the browser draws them --
// and a conversation described twice, once by the server's replies and once by
// what the page expects, drifts apart unnoticed.
//
// So this file is the conversation, once. The server serves exactly this table
// (`serve.ts` fails to start if a route has no handler), the page calls it by
// name (`frontend/app/api/client.ts`), and both are type-checked against the same
// request and response here. Types and one plain table only -- nothing that
// needs Node or a browser -- so either side can import it, and a bundle, which
// carries it, pays for a list.
//
// `for` is the security boundary. A `tool` route is what a deployed tool
// serves to whoever opens it; an `editor` route exists only while building,
// and a server without the editor answers it with 404. A `local` route is also
// refused by a server bound wider than loopback.

import type { ExecutionResult, Graph, GraphNode, NodeResult } from '../../graph/graph.ts';
import type { TextChange } from './project/changes.ts';
import type { ExampleRun } from '../../graph/authoring/examples.ts';
import type { RuntimeRequirement } from '../gui-editor/widgets/WidgetRunner.ts';
import type { GraphInterface } from '../gui-editor/graphInterface.ts';
import type { AICall } from '../../graph/authoring/history.ts';

export type { TextChange };

// ---------------------------------------------------------------------------
// What travels
// ---------------------------------------------------------------------------

/**
 * A round in flight, as a watching page sees it.
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
  item_done: number;
  item_total: number;
  /** Seconds since the running node last showed life; null before anything reported. */
  idle_seconds: number | null;
  error: string | null;
  result: ExecutionResult | null;
  /** What it handed back by name, once it has ended: the graph's outputs (`graphInterface.ts`). */
  outputs: Record<string, unknown> | null;
  /**
   * What began it: the start point it fired, and who sent it -- a block of the
   * page by its id, or one of `SENDERS` -- or null for a round of the whole
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
   * and the round count -- and each part of it by the name and the part
   * (`counter.clicks`): what the last round that ran to its end left, from
   * the design's values on, never a round half done. Watched without a round:
   * a block of the page can show it, a script read it.
   */
  state: Record<string, unknown>;
  /**
   * What each block of the page holds now, by the block's id: what was typed
   * or chosen, a conversation, what an end point handed back -- else its
   * design. Beside `sent`, not in it: a block and a start point may share a name.
   */
  page: Record<string, unknown>;
  /** What each block of the page that shows an end point shows, by the block's id: what arrived, as the page draws it. */
  shown: Record<string, unknown>;
  /**
   * What using the graph left that differs from its design -- what Start over
   * forgets: each node's values by node id and name (a data node's fields and
   * round count, what a start point was sent), and what each block of the page
   * holds, by id.
   */
  kept: { nodes: Record<string, Record<string, unknown>>; page: Record<string, unknown> };
  /** How many rounds have run to their end, and when the last did. */
  rounds: number;
  finished_at: number | null;
  /** The round going now, or the last one. */
  round: RoundSnapshot | null;
  /** What opening the session, or handing it a graph, dropped of what it kept: said once, in words. */
  dropped: string[];
  /** Which design this is, counted from 0: a page drawn from the design is drawn again when it changes. */
  design_revision: number;
  /** The graph's own clock (its start points that start themselves), which the server keeps while the application runs. */
  clock: ClockView;
}

/** The clock a session keeps: whether it runs, whether it ticks, and when the next round is due. */
export interface ClockView {
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
 * The page a tool shows, as the built-in page draws it: the graph's name and
 * scheme, its blocks as they were designed -- what each holds now is the
 * session's (`SessionView.page`) -- and whether opening it runs the graph
 * whole, as a program runs when it is started: nothing on the page or in a
 * start point of its own starts it otherwise (`startEvents`).
 */
export interface PageView {
  session: string;
  /** Which design of the session this page is: see SessionView.design_revision. */
  design_revision: number;
  name: string;
  description: string;
  scheme: string;
  blocks: Record<string, unknown>[];
  starts_whole: boolean;
}

/** What the graph offers whoever uses it, by name -- and which session that is. */
export interface InterfaceView extends GraphInterface {
  session: string;
  name: string;
  description: string;
}

/**
 * A round asked for by name: the event that starts it -- none, the whole
 * graph -- and the values it is given. A start point takes the values as its
 * package, under the sender's names.
 */
export interface RoundRequest {
  /** The session asked about; this server's, when left out. */
  session?: string;
  event?: string | null;
  /**
   * What the round is sent: for a round the page starts (*by* a block), what
   * its blocks hold, by block id; for another round of a start point, its
   * package's values under names of the sender's own. A round of the whole
   * graph is sent nothing.
   */
  values?: Record<string, unknown>;
  /** What `requirements` asked of a round the page starts, answered under the keys it asked with: the blocks' ids. */
  answers?: Record<string, unknown>;
  /** Who sends it, as the package says: a block of the page by its id. A script leaves it out, and is a "call". */
  by?: string;
}

/** What a round handed back, once it ended: what `runRound` answers. */
export interface RoundOutcome {
  session: string;
  round_id: string;
  status: ExecutionResult['status'];
  error: string | null;
  outputs: Record<string, unknown>;
}

/** A question about the session: this server's, when it names none. */
interface InSession {
  session?: string;
}

/** The graph the editor is editing, handed to the server's session (`Handover`). */
export interface HeldGraph {
  graph: Graph;
  /** Where it is kept, if anywhere: its session keeps its state beside it. */
  path?: string | null;
  /** The session the editor holds for it, as the hand-over before answered; none for a document not handed over yet. */
  session?: string | null;
}

/**
 * A path a round the page starts needs before it can run, as the "before
 * running" dialog asks for it: the backend's own question, keyed by the block
 * that answers it, so no end takes the key apart or builds it again.
 */
export type Requirement = RuntimeRequirement;

/** `project`: a folder with a `flow.json` in it, which opens rather than being walked into. */
export interface BrowseEntry { name: string; path: string; is_dir: boolean; project?: boolean }
/**
 * One directory, for a picker -- on this machine only: it is for the person at the keyboard.
 * `project`: the directory shown is a project itself.
 */
export interface BrowsePage { path: string; parent: string | null; entries: BrowseEntry[]; roots: string[]; project?: boolean }

/** Which model a deployed tool calls, and whether `ai-settings.json` is there; where it is stays on the machine. Read-only: see the route. */
export interface ToolAiSettings {
  provider: string;
  model: string;
  settings_file_exists: boolean;
}

/** A model, already resolved: which provider, which of its models. */
export interface Target { provider: string; model: string }

/** Lets the page watch a generation's transcript while it runs. */
export interface Watched { progress_id?: string }

/**
 * One node's writing to do, as its ✨ asks it: its input definition
 * (input.js), its output definition (output.js), or its body -- code, an ai
 * node's prompt, a data node's data. The node's element decides the rest.
 */
export interface GenerateRequest {
  /**
   * The node as the editor holds it: its kind, id, heading and text -- what
   * everything is written from -- its ports, its definitions and its body.
   * Its history is not needed.
   */
  node: GraphNode;
  /** What to write: `input` (input.js), `output` (output.js), or the body (the default). */
  write?: 'input' | 'output' | 'body';
  /** The graph around the node, in words: what {Context} says. Built by the editor. */
  context?: string;
  /**
   * The files ✨ Input writes the input definition from -- examples, a spec:
   * {Example Files}. Their text is read here, the start of each, where the
   * request does not bring it.
   */
  input_files?: { path: string; text?: string }[];
  /** The files ✨ Output writes the output definition from, the same way: {Output Files}. */
  output_files?: { path: string; text?: string }[];
  /**
   * Where each input is wired from and what that node hands on, by port id:
   * {Input Definition} while the node has no input.js.
   */
  input_sources?: Record<string, string>;
  /**
   * Where each output goes, by port id, and what the node there wants of it --
   * `"Sizes" chart on "Dashboard" -- wants: the data to plot…`: {Output
   * Definition} while the node has no output.js.
   */
  output_targets?: Record<string, string>;
  /**
   * What the person said to this file's chat, for a file not written yet: put
   * into the prompt after the standard one. Where there is a file to change,
   * the same words go in `refine.change`.
   */
  ask?: string;
  /**
   * Change the file there is, instead of writing one from nothing: a chat's
   * message and, for the body, ✨ Fix. A body's answer brings the node's text
   * back restated where there was something to change
   * (`GenerateResponse.description`), so the two are changed together.
   */
  refine?: Refine;
  /**
   * Build the request and hand it back without sending it: what ✨ *would*
   * send, through the same code that sends it, so the preview cannot differ.
   */
  preview?: boolean;
}

/** What came of the file there is, and what to change about it (`GenerateRequest.refine`). */
export interface Refine {
  /** What to change, in the person's words. Absent: repair the body from how it failed (✨ Fix). */
  change?: string;
  /** What the body gave on its example: its outputs as JSON, or a model's answer. */
  outcome?: string;
  /** The error it raised on its example. */
  error?: string;
  /** Where what it gave does not fit its output.js. */
  problems?: string[];
}

/** One request to a model, as it happened (`graph/authoring/history.ts`, which writes it into history.md). */
export type { AICall };

/**
 * What trying generated code on the node's example revealed -- the example in
 * its input.js, held to its output.js. `skipped`: there was nothing to try it
 * on; `ok` passed the first try, `repaired` the second.
 */
export interface ProbeReport {
  status: 'skipped' | 'ok' | 'repaired' | 'failed';
  /** How it failed, where it did not run. */
  error: string;
  /** Where what it returned does not fit its output.js, or misses an output. */
  problems: string[];
}

export interface GenerateResponse {
  /**
   * What was written: the whole file -- input.js, output.js, code.js,
   * prompt.md -- or, for a data node, the text of what it holds. Which field
   * it belongs in is the caller's business.
   */
  result: string;
  /**
   * The node's text, restated to fit a body changed as asked
   * (`GenerateRequest.refine` with a change): what the node says it does now.
   */
  description?: string;
  /**
   * The node's output definition, written anew with a body changed or fixed
   * (`refine`): the output.js a change needed where it outgrew the one there
   * was, or one that could not be read, corrected. The body was held to it;
   * it is written with the body, and the node's outputs are its keys.
   */
  output_definition?: string;
  /**
   * A data node's second file, written with its fields (`result`): the same
   * fields as rounds would have filled them -- one realistic value for each --
   * that what is wired to the node is written against. Left out where the
   * answer brought none that could be read: the node then shows its start.
   */
  example?: string;
  probe: ProbeReport;
  /** Every model call this generation made, in order: what the node's history.md keeps. For a preview, the one request, unsent. */
  calls: AICall[];
}

/** The settings dialog's view of `ai-settings.json`: whether a key is set, never the key. */
export interface SettingsStatus {
  settings_file: string;
  /**
   * The one AI setting as the file saves it, '' for unset; `environment` names
   * the variables that set it on this machine instead, and win.
   */
  ai: { provider: string; model: string; environment: string[] };
  endpoints: Record<string, string>;
  credentials: Record<string, { configured: boolean; source: string }>;
}

export interface SettingsPatch {
  /** The one AI setting. A provider of 'default' or '' leaves it unset. */
  ai?: { provider?: string; model?: string };
  endpoints?: Record<string, string>;
  api_keys?: Record<string, string>;
  /** Providers whose stored key is to be removed -- distinct from "left blank". */
  clear_keys?: string[];
}

/** A tool server that came with this installation (`mcp/<name>/config.json`), and what this machine has done with it. */
export interface McpServerView {
  /** Its folder's name, and the name a graph and `ai-settings.json` call it by. */
  name: string;
  title: string;
  about: string;
  /** The environment variables it reads, each with what it means: all it may be given. */
  env: Record<string, string>;
  /** Those it does not start without. */
  required: string[];
  /** Its `settings.html`, where the server brings its own interface; empty where it does not. */
  page: string;
  /** What is saved for it on this machine, by variable; null where it is not set up. */
  values: Record<string, string> | null;
  /** Its packages are in its folder, or it needs none. */
  installed: boolean;
  /** `ai-settings.json` has an entry of this name that is not this server's: it is used as it is, and not edited here. */
  by_hand: boolean;
  /** Why its `config.json` cannot be used, in a sentence. */
  problem: string;
}

/** The servers that came with this installation, and every name `ai-settings.json` has an entry for. */
export interface McpServersView {
  servers: McpServerView[];
  configured: string[];
  /** What separates the folders of a list in an environment variable on this machine: ; or : */
  delimiter: string;
}

/** A server saved, and started once to see that it does. */
export interface McpSaved {
  server: McpServerView;
  /** The tools it offered when it started. */
  tools: string[];
  /** Why it did not start; empty when it did. It is saved either way. */
  problem: string;
}

/** Which providers answer right now, and what the one AI setting resolves to. */
export interface ProviderStatus {
  local: Record<string, { reachable: boolean; models: string[] }>;
  /** What the one AI setting resolves to right now: what every call that names no model of its own goes to. */
  target: Target;
}

/** A graph file on disk, as Open (and so Reload) and Save return it. */
export interface GraphFile {
  path: string;
  graph: Graph;
  /** The path is a project folder, whose code and prompts are files of their own. */
  project: boolean;
}

/**
 * A failed call's body. A failed generation carries its transcript too; a
 * save refused because a graph is there already says so (`taken`): sent
 * again with `replace`, it replaces that graph.
 */
export interface Failure { detail: string; calls?: AICall[]; taken?: boolean }

// ---------------------------------------------------------------------------
// The routes
// ---------------------------------------------------------------------------

export type Method = 'GET' | 'POST';

/**
 * One route. `Req` is everything the handler is handed -- the JSON body, the
 * query and `:params`, merged into one object -- and `Res` what it answers.
 * The two type parameters exist only for the compiler; at run time a route is
 * its method, path and audience.
 */
export interface Route<Req, Res> {
  method: Method;
  /** `:name` segments are path parameters, handed over as `name`. */
  path: string;
  for: 'tool' | 'editor';
  /**
   * Answered only by a server bound to this machine (loopback): it looks at
   * the machine's files or starts a program for the person at the keyboard.
   * `serve.ts` refuses it otherwise, for every route here and nowhere else.
   */
  local?: true;
  /** Phantom: carries the types, never set. */
  readonly types?: { request: Req; response: Res };
}

function route<Req, Res>(method: Method, path: string, audience: 'tool' | 'editor'): Route<Req, Res> {
  return { method, path, for: audience };
}

/** *one*, answered on this machine only. */
function local<Req, Res>(one: Route<Req, Res>): Route<Req, Res> {
  return { ...one, local: true };
}

type OnNode = Graph & { node_id: string };

export const API = {
  // -- the runtime API: a graph used by name, by any frontend ---------------
  /** What the graph offers by name: its start points -- each with what the graph reads of what it is sent -- and its end points. */
  interface: route<InSession, InterfaceView>('GET', '/api/runtime/interface', 'tool'),
  /** The session now: what each start point was sent, what the outputs showed, the page, the round going or gone, the clock. */
  session: route<InSession, SessionView>('GET', '/api/runtime/session', 'tool'),
  /**
   * Server-sent events, not JSON: `session` once on connect and after every
   * change, `round` as each round starts, goes and ends -- the page's, a
   * clock's, another tab's. Read with an `EventSource`.
   */
  stream: route<InSession, never>('GET', '/api/runtime/stream', 'tool'),
  /** What a round for this event still needs before it runs, given these values: the "before running" questions. */
  requirements: route<RoundRequest, Requirement[]>('POST', '/api/runtime/requirements', 'tool'),
  /** Start a round, and watch it by its id. */
  startRound: route<RoundRequest, { session: string; round_id: string; total: number }>('POST', '/api/runtime/rounds', 'tool'),
  round: route<InSession & { id: string }, RoundSnapshot>('GET', '/api/runtime/rounds/:id', 'tool'),
  stopRound: route<InSession & { id: string }, { stopped: boolean }>('POST', '/api/runtime/rounds/:id/stop', 'tool'),
  /** Run a round and answer once it has ended: a function call. */
  runRound: route<RoundRequest, RoundOutcome>('POST', '/api/runtime/run', 'tool'),
  /** Forget what using the graph left behind: it is as designed again. */
  reset: route<InSession, SessionView>('POST', '/api/runtime/reset', 'tool'),

  // -- what the built-in page reads besides ----------------------------------
  /** The page as it was designed: what the built-in page draws, by the names its blocks are called. */
  page: route<InSession, PageView>('GET', '/api/runtime/page', 'tool'),
  /** Which model the tool calls. Read-only: a recipient configures it in a file, not in a page. */
  toolAiSettings: route<void, ToolAiSettings>('GET', '/api/runtime/ai-settings', 'tool'),
  /** Listing directories is for the person at the keyboard. */
  browse: local(route<{ path: string; extensions?: string }, BrowsePage>('POST', '/api/files/browse', 'tool')),

  // -- what only the editor serves ------------------------------------------
  /** One node on the inputs given, as a run runs it: files read, lists fanned out. How the editor reads a file the way a run does. */
  runNode: route<OnNode & { inputs: Record<string, unknown> }, NodeResult>('POST', '/api/execute/node', 'editor'),
  /** What would arrive at a node: what feeds it is run, the node is not. */
  nodeInputs: route<OnNode, { inputs: Record<string, unknown>; error: string | null }>('POST', '/api/execute/inputs', 'editor'),
  /** ▶ Try: one call of a node on the example in its input.js, held to its output.js. */
  testNode: route<OnNode, ExampleRun>('POST', '/api/execute/example', 'editor'),
  /**
   * Keep a round of this session that ran through as a test of the project at
   * *path*: `tests/<name>.json`, run again by `test` without asking a model
   * (`project/keptRounds.ts`).
   */
  keepRound: route<InSession & { id: string; path: string }, { name: string; file: string }>('POST', '/api/graphs/rounds/keep', 'editor'),

  /**
   * A project folder or a single graph file: see `project/folder.ts`. Also
   * Reload: the same path opened again, after its `flow.json`, or a node's
   * settings or ports, changed outside the editor.
   */
  openGraph: route<{ path: string }, GraphFile>('POST', '/api/graphs/file/load', 'editor'),
  /**
   * A `.json` path is written as one file; any other path as a project folder.
   * A graph already there -- a project, a graph file -- is written over only
   * when *replace* says so: refused otherwise (409, `Failure.taken`).
   */
  saveGraph: route<{ path: string; graph: Graph; replace?: boolean }, GraphFile>('POST', '/api/graphs/file/save', 'editor'),
  /**
   * Project folders with this name under where the editor runs: for a folder
   * dropped onto the page -- and where that search looked, in words, for a drop
   * that finds none to say.
   */
  findProjects: local(route<{ name: string }, { paths: string[]; searched: string }>('GET', '/api/graphs/find', 'editor')),
  /**
   * Files of this name and size under where the editor runs: for a file
   * dropped onto a node, whose path a browser never says -- and where that
   * search looked, in words, for a drop that finds none to say.
   */
  findFile: local(route<{ name: string; size: string }, { paths: string[]; searched: string }>('GET', '/api/files/find', 'editor')),
  /** The code and prompts of an open project that changed on disk since last asked. */
  projectChanges: route<{ path: string }, { changes: TextChange[] }>('GET', '/api/graphs/file/changes', 'editor'),

  generate: route<GenerateRequest & Watched, GenerateResponse>('POST', '/api/ai/generate', 'editor'),
  /** What the generation with this id has sent and received so far. */
  generationProgress: route<{ id: string }, { calls: AICall[] }>('GET', '/api/ai/generate/progress', 'editor'),
  /**
   * A whole graph from a description: designed anew -- or, sent the graph
   * there is (`graph`), that graph changed as the description says, its ids
   * and what the change does not touch kept.
   */
  generateGraph: route<{ description: string; graph?: Graph } & Watched, { graph: Graph; explanation: string }>(
    'POST', '/api/ai/generate-graph', 'editor'),

  /**
   * The graph as a deployable zip, named by the server (`<graph name>_bundle.zip`).
   * `path`, the project it was opened from, if any: what it carries of its own
   * beside the graph -- a page written by hand, `frontend/` -- goes with it.
   */
  bundle: route<{ graph: Graph; path?: string | null }, File>('POST', '/api/deploy/bundle', 'editor'),
  /**
   * Hand the server's session the graph being edited: what its rounds run,
   * whoever starts them -- the App tab, the Page tab, the clock, `runtime.html`
   * opened against it as the deployed page in a window of its own. Answers
   * with the session, and what it dropped of what it kept.
   */
  holdGraph: route<HeldGraph, { session: string; dropped: string[] }>('POST', '/api/runtime/hold', 'editor'),
  /**
   * ▶ Run: start what runs by itself -- start points at start, and their
   * clocks -- once what starting runs has run. `ticks`: a clock goes on.
   */
  startApplication: route<InSession, { ticks: boolean }>('POST', '/api/runtime/application/start', 'editor'),
  /** ■ Stop: the clocks, and the round in flight. */
  stopApplication: route<InSession, { stopped: boolean }>('POST', '/api/runtime/application/stop', 'editor'),

  aiSettings: route<void, SettingsStatus>('GET', '/api/ai/settings', 'editor'),
  saveAiSettings: route<SettingsPatch, SettingsStatus>('POST', '/api/ai/settings', 'editor'),
  providers: route<void, ProviderStatus>('GET', '/api/ai/providers', 'editor'),

  /**
   * The tool servers in `mcp/`, and what this machine has set up. Setting one
   * up writes the command that starts it into `ai-settings.json` and may run
   * npm: the person's, at the keyboard.
   */
  mcpServers: local(route<void, McpServersView>('GET', '/api/mcp/servers', 'editor')),
  /** Set a server up on this machine with these values -- installing its packages if they are not there -- and start it once to see that it starts. */
  saveMcpServer: local(route<{ name: string; values: Record<string, string> }, McpSaved>('POST', '/api/mcp/servers/:name', 'editor')),

  /**
   * One of a node's files in a project, in the person's own editor: `file`,
   * named from the node's folder -- `input.js`, `history.md` -- or, without
   * it, its body (`nodes/<id>/code.js`). The node is one of the graph
   * `inside` leads down to: the ids of the nodes that hold it, outermost
   * first (`nodeFileOf`). It starts a program.
   */
  openExternal: local(route<{ graph_path: string; inside?: string[]; node_id: string; file?: string }, { path: string; with: string }>('POST', '/api/files/open-external', 'editor')),
} as const;

export type Api = typeof API;
export type RouteName = keyof Api;
export type RequestOf<K extends RouteName> = NonNullable<Api[K]['types']>['request'];
export type ResponseOf<K extends RouteName> = NonNullable<Api[K]['types']>['response'];

/**
 * Match a request against the table: which route, and its `:params`.
 *
 * Here rather than in the server because it is the table's own rule -- how a
 * path with parameters is read -- and the page's client writes paths by the
 * inverse of it (`pathFor`).
 */
export function matchRoute(method: string, path: string): { name: RouteName; params: Record<string, string> } | null {
  for (const name of Object.keys(API) as RouteName[]) {
    const candidate = API[name];
    if (candidate.method !== method) continue;
    const params = matchPath(candidate.path, path);
    if (params) return { name, params };
  }
  return null;
}

/** The concrete path for a route, with its `:params` filled in from the request. */
export function pathFor(name: RouteName, request: Record<string, unknown> = {}): { path: string; rest: Record<string, unknown> } {
  const rest = { ...request };
  const path = API[name].path.replace(/:([a-z_]+)/g, (_, key: string) => {
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
