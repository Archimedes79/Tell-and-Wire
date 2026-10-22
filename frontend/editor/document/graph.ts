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
  GraphNode as FormatNode, NodeResult, NodeType, Port, WidgetKind,
} from '../../../graph/graph.ts';

import type { GuiWidget } from '../../deployment/gui/kit/guiWidget';

export type { DataType, FormatGraph, ExecutionResult, GraphEdge, GuiWidget, NodeResult, NodeType, Port, WidgetKind };

/**
 * An edge as the canvas holds it, which port of which node feeds which: the
 * loose shape a ReactFlow edge satisfies, handles possibly null. Not the saved
 * `GraphEdge`, whose fields are named for the file.
 */
export type Wire = { source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null; data?: { via?: string[] } };

export type AIProvider =
  'default' | 'ollama' | 'openai' | 'openai_compatible' | 'anthropic' | 'lmstudio' | 'google' | 'github_copilot';

/** What a run said: about one node, or about the whole run. */
export type ExecutionStatus = NodeResult['status'] | ExecutionResult['status'];

export interface Graph {
  metadata: GraphMetadata;
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** The schedule: the rows of its table of cells (`graph/schedule.ts`). */
  schedule?: string[];
  /** The GUI the graph is used through: its blocks, which connect themselves to its start and end points by name. None, for a graph without one. */
  gui?: Gui;
}

/** A GUI: its blocks, in order. One with none is no GUI. */
interface Gui {
  blocks: GuiWidget[];
}

export interface GraphMetadata extends FormatMetadata {
  gui_scheme: 'night' | 'paper' | 'white' | 'graphite';
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
  /** code, ai and subgraph only (`NodeDefinition.fansOut`): how many items of a fan-out run at once, 0 for the run's default. */
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
  /** What one call of a code or ai node is handed: `input_example.js`, a JSDoc typedef and one example. See `graph/files/definition.ts`. */
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
  extensions: string;
  /** Tool servers an ai node may call, one per line: a URL, or a name this machine configured. */
  mcp_servers?: string;
  /** An ai node: how often to ask again when the answer cannot be used (no JSON, a key left out, cut off). Unset: the machine's setting, else 2. */
  repairs?: number;
  /** A start point: who starts it -- the GUI, a call, itself -- and, by itself, when the tool starts and how often (`5m`). */
  started_by: 'gui' | 'call' | 'itself';
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
