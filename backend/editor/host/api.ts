// The wire between the editor and the server: the routes only the editor serves, and what travels.
//
// The editor's table, beside the host's (`backend/deployment/host/api.ts`, which holds the
// machinery both are made with). A package does not carry this file: a deployed tool answers
// none of these with anything but a 404.

import { PRODUCT_API } from '../../authoring/productApi.ts';
import type { Graph, GraphNode, NodeResult } from '../../../graph/graph.ts';
import type { TextChange } from '../../../graph/files/changes.ts';
import type { AICall } from '../../../graph/authoring/history.ts';
import type { ExampleRun } from '../../deployment/runtime/examples.ts';
import { local, route, type InSession } from '../../deployment/host/api.ts';

export type { TextChange, ExampleRun };

// ---------------------------------------------------------------------------
// What travels
// ---------------------------------------------------------------------------

/** The graph the editor is editing, handed to the server's session (`Handover`). */
interface HeldGraph {
  graph: Graph;
  /** Where it is kept, if anywhere: its session keeps its state beside it. */
  path?: string | null;
  /** The session the editor holds for it, as the hand-over before answered; none for a document not handed over yet. */
  session?: string | null;
}

/** A model, already resolved: which provider, which of its models. */
export interface Target { provider: string; model: string }

/** Lets the page watch a generation's transcript while it runs. */
interface Watched { progress_id?: string }

/**
 * One node's writing to do, as its ✨ asks it: its input definition
 * (input.js), its output definition (output.js), or its body -- code, an ai
 * node's prompt, a data node's data. The node's design decides the rest.
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
   * The AI the nodes run on, as the file saves it, '' for unset; `environment` names
   * the variables that set it on this machine instead, and win.
   */
  ai: { provider: string; model: string; environment: string[] };
  /** The same for the AI that writes (✨); all '' where it is the one the nodes run on. */
  writing: { provider: string; model: string; environment: string[] };
  endpoints: Record<string, string>;
  credentials: Record<string, { configured: boolean; source: string }>;
}

export interface SettingsPatch {
  /** The AI the nodes run on. A provider of 'default' or '' leaves it unset. */
  ai?: { provider?: string; model?: string };
  /** The AI that writes. Left unset, it is the one the nodes run on. */
  writing?: { provider?: string; model?: string };
  endpoints?: Record<string, string>;
  api_keys?: Record<string, string>;
  /** Providers whose stored key is to be removed -- distinct from "left blank". */
  clear_keys?: string[];
}

/** A tool server that came with this installation (`mcp/<name>/config.json`), and what this machine has done with it. */
export interface McpServerView {
  /** Its folder's name, and the name a graph and the machine's settings file call it by. */
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
  /** The machine's settings file has an entry of this name that is not this server's: it is used as it is, and not edited here. */
  by_hand: boolean;
  /** Why its `config.json` cannot be used, in a sentence. */
  problem: string;
}

/** The servers that came with this installation, and every name the machine's settings file has an entry for. */
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
  /** What the AI the nodes run on resolves to right now: what every call of a node that names no model of its own goes to. */
  target: Target;
  /** What the AI that writes (✨) resolves to: `target`, where it is not set apart. */
  writing: Target;
  /** Why that cannot answer yet -- a server not running, a key or a model not there -- as a sentence for whoever puts it right; empty when nothing is in the way. */
  problem: string;
  /** The same for `writing`. */
  writing_problem: string;
}

/** A graph file on disk, as Open (and so Reload) and Save return it. */
export interface GraphFile {
  path: string;
  graph: Graph;
  /** The path is a project folder, whose code and prompts are files of their own. */
  project: boolean;
}

/** One request to a model, as it happened (`graph/authoring/history.ts`, which writes it into history.md). */
export type { AICall };

// ---------------------------------------------------------------------------
// The routes
// ---------------------------------------------------------------------------

type OnNode = Graph & { node_id: string };

/** What only the editor serves. */
export const EDITOR_API = {
  /** Who this is, and the way to the notebook (`backend/authoring/productApi.ts`). */
  ...PRODUCT_API,

  /** One node on the inputs given, as a run runs it: files read, lists fanned out. How the editor reads a file the way a run does. */
  runNode: route<OnNode & { inputs: Record<string, unknown> }, NodeResult>('POST', '/api/execute/node'),

  /** What would arrive at a node: what feeds it is run, the node is not. */
  nodeInputs: route<OnNode, { inputs: Record<string, unknown>; error: string | null }>('POST', '/api/execute/inputs'),

  /** ▶ Try: one call of a node on the example in its input.js, held to its output.js. */
  testNode: route<OnNode, ExampleRun>('POST', '/api/execute/example'),

  /**
   * Keep a round of this session that ran through as a test of the project at
   * *path*: `tests/<name>.json`, run again by `test` without asking a model
   * (`project/keptRounds.ts`).
   */
  keepRound: route<InSession & { id: string; path: string }, { name: string; file: string }>('POST', '/api/graphs/rounds/keep'),

  /**
   * A project folder or a single graph file: see `project/folder.ts`. Also
   * Reload: the same path opened again, after its `graph-flow.json`, or a node's
   * settings or ports, changed outside the editor.
   */
  openGraph: route<{ path: string }, GraphFile>('POST', '/api/graphs/file/load'),

  /**
   * A `.json` path is written as one file; any other path as a project folder.
   * A graph already there -- a project, a graph file -- is written over only
   * when *replace* says so: refused otherwise (409, `Failure.taken`).
   */
  saveGraph: route<{ path: string; graph: Graph; replace?: boolean }, GraphFile>('POST', '/api/graphs/file/save'),

  /**
   * Project folders with this name under where the editor runs: for a folder
   * dropped onto the page -- and where that search looked, in words, for a drop
   * that finds none to say.
   */
  findProjects: local(route<{ name: string }, { paths: string[]; searched: string }>('GET', '/api/graphs/find')),

  /** The code and prompts of an open project that changed on disk since last asked. */
  projectChanges: route<{ path: string }, { changes: TextChange[] }>('GET', '/api/graphs/file/changes'),

  generate: route<GenerateRequest & Watched, GenerateResponse>('POST', '/api/ai/generate'),

  /** What the generation with this id has sent and received so far. */
  generationProgress: route<{ id: string }, { calls: AICall[] }>('GET', '/api/ai/generate/progress'),

  /**
   * A whole graph from a description: designed anew -- or, sent the graph
   * there is (`graph`), that graph changed as the description says, its ids
   * and what the change does not touch kept.
   */
  generateGraph: route<{ description: string; graph?: Graph } & Watched, { graph: Graph; explanation: string }>(
    'POST', '/api/ai/generate-graph'),

  /**
   * The graph as a deployable zip, named by the server (`<graph name>_bundle.zip`).
   * `path`, the project it was opened from, if any: what it carries of its own
   * beside the graph -- a GUI written by hand, `frontend/` -- goes with it.
   */
  bundle: route<{ graph: Graph; path?: string | null }, File>('POST', '/api/deploy/bundle'),

  /**
   * Hand the server's session the graph being edited: what its rounds run,
   * whoever starts them -- the App tab, the GUI tab, the clock, `gui.html`
   * opened against it as the deployed gui in a window of its own. Answers
   * with the session, and what it dropped of what it kept.
   */
  holdGraph: route<HeldGraph, { session: string; dropped: string[] }>('POST', '/api/runtime/hold'),

  /**
   * ▶ Run: start what runs by itself -- start points at start, and their
   * clocks -- once what starting runs has run. `ticks`: a clock goes on.
   */
  startApplication: route<InSession, { ticks: boolean }>('POST', '/api/runtime/application/start'),

  /** ■ Stop: the clocks, and the round in flight. */
  stopApplication: route<InSession, { stopped: boolean }>('POST', '/api/runtime/application/stop'),

  aiSettings: route<void, SettingsStatus>('GET', '/api/ai/settings'),

  saveAiSettings: route<SettingsPatch, SettingsStatus>('POST', '/api/ai/settings'),

  providers: route<void, ProviderStatus>('GET', '/api/ai/providers'),

  /**
   * The tool servers in `mcp/`, and what this machine has set up. Setting one
   * up writes the command that starts it into the machine's settings file and may run
   * npm: the person's, at the keyboard.
   */
  mcpServers: local(route<void, McpServersView>('GET', '/api/mcp/servers')),

  /** Set a server up on this machine with these values -- installing its packages if they are not there -- and start it once to see that it starts. */
  saveMcpServer: local(route<{ name: string; values: Record<string, string> }, McpSaved>('POST', '/api/mcp/servers/:name')),

  /**
   * One of a node's files in a project, in the person's own editor: `file`,
   * named from the node's folder -- `input.js`, `history.md` -- or, without
   * it, its body (`nodes/<id>/code.js`). The node is one of the graph
   * `inside` leads down to: the ids of the nodes that hold it, outermost
   * first (`nodeFileOf`). It starts a program.
   */
  openExternal: local(route<{ graph_path: string; inside?: string[]; node_id: string; file?: string }, { path: string; with: string }>('POST', '/api/files/open-external')),
} as const;
