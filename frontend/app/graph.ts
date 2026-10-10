// The graph as the editor sees it.
//
// `graph/graph.ts` is the format's home, and everything the *graph
// file* means comes from there: ports, edges, node types, block kinds, a run's
// result. What this adds is one view graph/ deliberately does not have:
// every element's settings spelled out in `NodeConfig`, because a config panel
// reads `node.config.temperature` and wants a type there, while graph/
// treats a config as opaque and lets each element read its own.
//
// That is the only difference, and it is a narrowing: an editor graph *is* a
// format graph (it is sent as one), and a format graph read back is taken as
// the editor's view in one place, `api/client.ts`.

import type {
  DataType, ExecutionResult, Graph as FormatGraph, GraphEdge, GraphMetadata as FormatMetadata,
  GraphNode as FormatNode, NodeResult, NodeType, Port, PortKind, WidgetKind,
} from '../../graph/graph.ts';

export type { DataType, FormatGraph, ExecutionResult, GraphEdge, NodeResult, NodeType, Port, PortKind, WidgetKind };

/**
 * An edge as the canvas holds it, which port of which node feeds which: the
 * loose shape a ReactFlow edge satisfies, handles possibly null. Not the saved
 * `GraphEdge`, whose fields are named for the file.
 */
export type Wire = { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null };

export type AIProvider =
  'default' | 'ollama' | 'openai' | 'openai_compatible' | 'anthropic' | 'lmstudio' | 'google' | 'github_copilot';

/** What a run said: about one node, or about the whole run. */
export type ExecutionStatus = NodeResult['status'] | ExecutionResult['status'];

export interface Graph {
  metadata: GraphMetadata;
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** The page the graph is used through: its blocks, which connect themselves to its start and end points by name. None, for a graph without one. */
  page?: Page;
}

/** A page: its blocks, in order. One with none is no page. */
export interface Page {
  blocks: GuiWidget[];
}

export interface GraphMetadata extends FormatMetadata {
  gui_scheme: 'night' | 'paper' | 'office' | 'graphite' | 'anthracite';
}

export interface GraphNode extends Omit<FormatNode, 'config'> {
  config: NodeConfig;
}

/**
 * Every element's settings, in one type. A type, not an interface, so an
 * editor node is assignable to the format's `Record<string, unknown>` config.
 */
export type NodeConfig = {
  ai_model: string;
  ai_provider: AIProvider;
  /** code, ai and subgraph only (`NodeRunner.fansOut`): how many items of a fan-out run at once, 0 for the run's default. */
  batch_concurrency: number;
  /** code, ai and subgraph only: run once per item. */
  batch_mode: 'per_item' | 'whole_list';
  catch_errors: boolean;
  code: string;
  /**
   * An ai node's instructions, with {Node Description} and {Output Definition}
   * filled in when it runs: `prompt.md` in a project. Empty: the standard ones.
   */
  prompt: string;
  /** What one call of a code or ai node is handed: `input.js`, a JSDoc typedef and one example. See `graph/authoring/definition.ts`. */
  input_definition?: string;
  /** What one call of a code or ai node returns: `output.js`. Its example's keys are the outputs. */
  output_definition?: string;
  /** Every exchange with the model about the node: `history.md`. See `graph/authoring/history.ts`. */
  history?: string;
  /** The files the Input chat writes a code or ai node's input definition from -- examples, a spec; none: the one the graph hands it. */
  input_files?: string[];
  /** The files the Output chat writes its output definition from, where it is given some. */
  output_files?: string[];
  /** A data node: its fields as they start -- an object, each key a field -- which it holds between rounds, and `data.json` keeps. */
  data_value?: unknown;
  /** A data node: what its fields look like once rounds have filled them -- what is wired to it is written against it -- and `example.json` keeps. The fields themselves where there is none. */
  data_example?: unknown;
  /** A data node: the rounds it has been through. Counted by a session, never part of the design. */
  data_round?: number;
  extensions: string;
  /** Tool servers an ai node may call, one per line: a URL, or a name this machine configured. */
  mcp_servers?: string;
  /** A start point: who starts it -- the page, a call, itself -- and, by itself, when the tool starts and how often (`5m`). */
  started_by: 'page' | 'call' | 'itself';
  /** A start point: what it is sent when nobody sends it anything -- a run of it on its own, ▶ Try -- as a caller would name it. */
  values?: Record<string, unknown>;
  on_start: boolean;
  every: string;
  /** A start point that starts itself: what it sends -- one file, the files of a folder (`path`, `extensions`, `recursive`) -- or nothing. */
  reads: 'file' | 'folder' | '';
  /** The graph a subgraph node holds: its own project folder on disk. */
  subgraph?: unknown;
  /** A start point: the file or folder it reads; an end point: the file or folder it writes to. A path wired into "path" wins. */
  path: string;
  recursive: boolean;
  send_images: boolean;
  /** Unset: the model's own default -- current Claude models refuse one at all. */
  temperature?: number;
  /** An end point: also write the run's result to a file, or one file per value into a folder. */
  write_mode: 'none' | 'file' | 'directory';
};

/**
 * One block on a page. Nothing is wired to it: it connects itself to the
 * graph's start and end points by name (`sends_to`, `fires`, `shows`), and
 * its `id` is the name its data is sent under -- so it stays stable once
 * assigned, as what reads it reads it by that name.
 *
 * Beyond who it is, how it is drawn and how it connects, a block holds only
 * its own kind's settings, so they are optional here: a divider has no
 * options, and a block written by hand, by ✨ or over MCP leaves out what it
 * does not set. Read one the way its runner does -- `recursive` missing means
 * only the folder itself.
 */
export type GuiWidget = {
  /** `input_picker`: the file types a folder's listing keeps. */
  extensions?: string;
  h?: number;
  id: string;
  kind: WidgetKind;
  label: string;
  mode?: string;
  /** `input_picker`: a folder's listing looks into its subfolders too. */
  recursive?: boolean;
  /** `input_picker`: "path" sends only where the file is, not what is in it. */
  send?: string;
  tone: 'plain' | 'raised' | 'sunken' | 'accent';
  /** Draw a frame regardless of the tone; unset lets the tone decide. */
  border?: boolean;
  /** A background colour of your own; empty lets the tone decide. */
  background?: string;
  /** The start points its data goes to: it is in the package of each, under the block's id. */
  sends_to?: string[];
  /** The start point using it fires, or none. */
  fires?: string | null;
  /** The end point it shows, or none. */
  shows?: string | null;
  /** `select`: its choices, one per line. */
  options?: string;
  /** `slider`: the range and increment it moves in. */
  min?: number;
  max?: number;
  step?: number;
  value?: unknown;
  w?: number;
};
