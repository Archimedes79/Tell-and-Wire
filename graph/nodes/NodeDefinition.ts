// A node: the element branch that sits on the canvas and runs in the graph.
//
// This is what a node *is*: its kind, its ports, the graph it may hold, what
// it keeps and offers, and the questions a run puts to it. Neutral -- it runs in
// a browser tab as well as under Node -- and a package carries it. What the
// node *does* when it runs is its runner (`backend/deployment/runtime/nodes/`),
// what only building asks is its design (`graph/editor/nodes/`).
//
// Only a node has writing: a body someone writes -- code, instructions --
// with files of its own in a project folder, and a way for an AI to write it.
// A block on a GUI shows or hands on what it holds, and writes nothing.

import type { DataType, Graph, GraphNode, NodeResult, NodeType, Port } from '../graph.ts';
import { collectedInterface, type Schema } from '../schema.ts';
import { runsPerItem } from '../batching.ts';
import type { Logic } from '../files/logic.ts';
import { definitionShape, type Definitions } from '../files/definition.ts';
import { ElementDefinition } from './ElementDefinition.ts';

/**
 * Who starts an event: the GUI -- one of its blocks, so the graph needs a
 * gui --, a call from outside -- a script, a model over MCP, the graph
 * above --, or the graph itself, when the tool starts and on a clock.
 */
export type StartedBy = 'gui' | 'call' | 'itself';

/** One thing a node offers whoever uses the graph from outside. */
export interface Offer {
  /** An event starts a round, an output is what a round hands back, a state is what a node holds -- watched without a round. */
  kind: 'event' | 'output' | 'state';
  /** What a caller calls it: the node's id -- and, for one part of a state, the part after a dot. */
  name: string;
  /** A state's: the part of what the node holds that this offers -- a field of a struct -- or all of it. */
  part?: string;
  /** What a person reads: the node's label. */
  label: string;
  type: DataType;
  /** A list of them. */
  list?: boolean;
  description?: string;
  /** An event's: the port it fires on. */
  port?: string;
  /** An event's: who starts it. */
  startedBy?: StartedBy;
}

/**
 * One piece of a node's writing, as a project folder keeps it: a file of its
 * own in the node's folder instead of a string inside its entry in `graph-nodes.json`.
 */
export interface TextFile {
  /** The config key it is stored under. */
  field: string;
  /** Its name in the node's folder. */
  file: string;
  /** A value kept as JSON rather than as text: what a data node holds, its fields. */
  json?: boolean;
  /**
   * What the file says while the node holds nothing of its own there: written
   * all the same, so a node's folder shows every file it has from the start,
   * and read back as nothing -- a stub that says what the file is and which ✨
   * writes it.
   */
  standard?: string;
  /**
   * Written after what the node holds, and taken off again when the file is
   * read, so the node never holds it: what makes a file work on its own --
   * `node code.js` runs the node on its example.
   */
  footer?: string;
}

/**
 * The kinds of node, as anything that derives ports may need to ask about them:
 * a node holding a graph has to know which nodes inside it stand at its edge.
 * The registry answers this; so does a test with two kinds in a map.
 */
export interface Kinds {
  node(type: string): NodeDefinition<unknown> | undefined;
}

export abstract class NodeDefinition<C = unknown> extends ElementDefinition<GraphNode, C> {
  abstract readonly nodeType: NodeType;

  /**
   * What this node keeps in files of its own when its graph is a project
   * folder. Everything else it stores stays in its entry in `graph-nodes.json`.
   *
   * Fixed names rather than ones made from a label: a folder holding
   * `input.js`, `output.js` and `code.js` says what each file is
   * before it is opened, and renaming a node renames nothing on disk.
   */
  texts(_node: GraphNode): readonly TextFile[] {
    return [];
  }

  /**
   * The code this node runs, if its body is code: the body and where it is
   * kept. `undefined` for any other node -- an ai node's instructions are sent
   * to a model, not run, and an end point holds settings, not something
   * written at length.
   */
  logic(_node: GraphNode): Logic | undefined {
    return undefined;
  }

  /**
   * The ports this node has, *when they follow from its settings*.
   *
   * Two kinds of node, and the difference is worth naming. A start point's
   * ports follow from what it is -- one package on `data` --, a data node's
   * from the fields it holds, and a subgraph's from the graph it holds.
   * Nobody names those, and a copy of them in the editor is a copy that can
   * disagree with what the element emits.
   *
   * A code or AI node, or an end point, is the other kind: a person names its ports
   * to match the code they wrote or the prompt they gave. `count_per_file` has
   * an input called `file`; `total` produces `bla_count` and `summary`. Those
   * are the graph's, not the element's, and returning null says so — the test
   * that checks declarations against real graphs is what made the distinction
   * visible in the first place.
   */
  derivedPorts(_node: GraphNode, _kinds: Kinds): { inputs: Port[]; outputs: Port[] } | null {
    return null;
  }

  /**
   * Whether a failure here becomes an `error` output instead of ending the run.
   *
   * Off unless someone asks for it: a graph that has not been given somewhere
   * to put a failure should stop at one, loudly. Carried out by the executor,
   * one level up, so every kind gets the same behaviour without a copy of
   * it -- the same division as batching and reading file inputs.
   */
  catchesErrors(node: GraphNode): boolean {
    return node.config.catch_errors === true;
  }

  /**
   * The graph this node holds, or null for a node that holds none.
   *
   * The one question asked about hierarchy, and it is asked of the element so
   * that nothing else has to know which node type holds a graph. The project
   * folder recurses on it, `check` descends on it, a package follows it, and the
   * editor opens what it returns. A node that answers with a graph is a node
   * whose folder is a project folder of its own.
   */
  nestedGraph(_node: GraphNode): Graph | null {
    return null;
  }

  /**
   * Put a graph read from its own folder back into this node, or `null` to
   * take it out because it lives in a file now.
   *
   * The other half of `nestedGraph`: the element owns where it keeps it, the
   * project folder only says what it found.
   */
  setNestedGraph(_node: GraphNode, _graph: Graph | null): void {}

  /** What a run of the graph returns: the outputs of every node that says so, by their labels. */
  readonly isResult: boolean = false;

  /**
   * What this node's outputs are called in the run's result, when it is one:
   * its id, unless the element names it otherwise -- an end point by its
   * label. The run keys the result by it and `check` compares it, so both ask
   * here.
   */
  resultLabel(node: GraphNode): string {
    return node.id;
  }

  /**
   * Whether this node is where its graph meets whatever holds it: `'in'` for
   * where what the graph above hands down arrives, `'out'` for what it is
   * handed back up. A start point and an end point -- the same two ends a
   * graph has for a GUI and for a call: there is one kind of way in and one
   * of way out.
   */
  boundaryRole(_node: GraphNode): 'in' | 'out' | null {
    return null;
  }

  /**
   * The inputs of this node that carry what it reports, in the order it declares
   * them. All of them, unless one is a control: an end point's `path` says
   * where to write, not what.
   */
  valuePorts(node: GraphNode): Port[] {
    return node.inputs;
  }

  /**
   * The node's input and output definitions -- `input.js` and `output.js`
   * (`files/definition.ts`) -- or undefined for a kind that has none. A
   * code node and an ai node have them: what one call is handed, and what it
   * returns.
   */
  definitions(_node: GraphNode): Definitions | undefined {
    return undefined;
  }

  /**
   * What this node's outputs are held to: the shape of its output
   * definition's example, as the node hands it on -- for a node run once per
   * item, the list the calls' answers are collected into. Every run is checked
   * against it, and a wire from it into a port that takes something else is a
   * problem `check` names. None while it has no output definition.
   */
  outputInterface(node: GraphNode): Schema | undefined {
    const output = this.definitions(node)?.output;
    const shape = output?.trim() ? definitionShape(output) : undefined;
    const mode = this.batchMode(node);
    if (!shape || mode !== 'per_item') return shape;
    const lists = new Set(node.outputs.filter((port) => port.multi).map((port) => port.id));
    return collectedInterface(shape, lists, runsPerItem(node, mode));
  }

  /**
   * This node keeps what is delivered to it between rounds: it fills from what
   * arrives and forwards what it then holds, in the same round. A wire from it
   * to a node that runs before it carries what it held when the round began
   * (`readingWires`), so a loop can close. What arrived is kept when the round
   * is over.
   */
  readonly isMemory: boolean = false;

  /**
   * The output ports of this node that can start a round: a start point's.
   *
   * The executor asks so it can say which of them *did*, this round
   * (`Runtime.fired`), and read a wire from one into a node's ◆ as open or
   * closed. Most nodes start nothing.
   */
  eventPorts(_node: GraphNode): string[] {
    return [];
  }

  /**
   * Whether this node asks whoever holds the graph to keep a clock for it.
   * A graph inside a node has nobody to ask: only the outermost one is held.
   */
  keepsTime(_node: GraphNode): boolean {
    return false;
  }

  /**
   * Whether this node works *on* what is wired into it, so that a round in
   * which every wire came up empty is a round with nothing to do. An ai node
   * does: its inputs are the question. A code node does not -- "no file chosen
   * yet" is a case its body may well want to draw.
   */
  needsInput(_node: GraphNode): boolean {
    return false;
  }

  /**
   * This kind can be set to run once per item (`config.batch_mode`): its body
   * is written by a person or ✨ for one item, and "Run once per item" is its
   * setting. Every other kind takes what arrives whole, whatever its config
   * says: an end point that fanned out wrote each item over the same file.
   */
  readonly fansOut: boolean = false;

  /**
   * Whether this node runs once for the whole list or once per item.
   *
   * A declaration, not an implementation: the fan-out itself belongs to the
   * executor, so "run this once per element" works the same for a code node and
   * an AI node -- an empty list included -- and would work for a third kind
   * without either being told. A file that leaves the key out means the whole
   * list.
   */
  batchMode(node: GraphNode): 'whole' | 'per_item' {
    return this.fansOut && node.config.batch_mode === 'per_item' ? 'per_item' : 'whole';
  }

  /** How many items of a fan-out may be in flight at once. */
  batchConcurrency(node: GraphNode): number {
    return Number(node.config.batch_concurrency ?? 0) || 4;
  }

  /**
   * This kind is handed a file's *content* on each input port typed
   * `file_path` -- the port's own "Read the file at this path" -- instead of
   * the path. Only that tick decides, never the wire: a sentence wired in is
   * never read as a filename, and a path wanted as a path is left one.
   *
   * Declared, like batching, and carried out by the executor: a code node and
   * an AI node both want it and neither should own it.
   */
  readonly readsFileInputs: boolean = false;

  /**
   * What this node offers whoever uses the graph from outside -- a GUI, a
   * script, the graph above: an event that starts a round, or an output it
   * hands back. Each under a name a caller uses, never a port:
   * `graph/interface.ts` gathers them into the graph's own.
   */
  offers(_node: GraphNode): Offer[] {
    return [];
  }

  /** What this node hands back as the output it offers, from its result in a round. */
  shows(_node: GraphNode, _result: NodeResult): unknown {
    return undefined;
  }

  /**
   * Whether this node starts itself -- when the tool starts (`on_start`), and again every so often
   * (`every`: `45`, `30s`, `5m`, `2h`, `1d`, empty for never) -- or null: somebody else starts it
   * or it starts nothing. The first of its `eventPorts` is the event it is (`triggers.ts`).
   */
  trigger(_node: GraphNode): { on_start: boolean; every: string } | null {
    return null;
  }

  /**
   * Whether this node calls a model when it runs -- which is whether whoever runs the tool needs an
   * AI set up. None does by default; an AI node always does, a code node when its code calls one,
   * a subgraph when a node in it does.
   */
  callsModel(_node: GraphNode, _kinds: Kinds): boolean {
    return false;
  }

  /**
   * Who starts this node's events: the GUI, a call from outside, or the
   * graph itself -- none, for a node that starts nothing. A graph the GUI or
   * a call starts waits for them when it starts; one that starts itself does
   * not wait for anybody (`triggers.ts`, `startEvents`).
   */
  startedBy(_node: GraphNode): StartedBy | null {
    return null;
  }

  /**
   * This node is where a round begins, and takes what the round was sent as
   * one package (`startWith`) -- whatever the sender named it. Nothing else
   * from outside the graph reaches a node: it arrives on a wire from here.
   */
  readonly takesPackage: boolean = false;

  /** Hand this start point what the round it begins was sent: by whom, and the values, under the sender's names. */
  startWith(_node: GraphNode, _sent: { by: string; values: unknown }): void {}

  /** What this start point was sent last: the values of the last round it began, else its design's. */
  lastSent(_node: GraphNode): unknown {
    return undefined;
  }

  /**
   * What this node is answered with, in place of running, when the graph
   * above hands *value* down to it (`subgraph/boundary.ts`): a start point
   * hands it on as its package. Nothing, for a node that is no way in.
   */
  answerWith(_node: GraphNode, _value: unknown): Record<string, unknown> {
    return {};
  }

  /**
   * What this node holds as it is now, to be watched without a round: a
   * memory node's whole content -- offered under its name as a `state`, and
   * each part of it under the name and the part (`offers`) -- and told by every
   * session (`SessionView.state`): what the last round that ran to its end left,
   * never a round half done. Nothing, for a node that holds nothing to watch.
   */
  holds(_node: GraphNode): unknown {
    return undefined;
  }

  /**
   * Store a value that arrived on *portId* as this node's remembered state.
   * Only meaningful when `isMemory`; where it goes differs per element, which
   * is why the executor asks instead of branching on the node type.
   */
  settleMemory(_node: GraphNode, _portId: string, _value: unknown): void {}

  /**
   * What this node keeps between rounds, value by value, each under a name of
   * its own: what using the graph changes about it, as against how it was
   * designed -- a data node's fields, what a start point
   * was sent. A session reads it after a round and puts it back before the
   * next (`setState`), on a copy, so that using a graph never changes its
   * design (`backend/deployment/host/session.ts`); a value whose design changed is
   * dropped, and only that one. Nothing, for a node that keeps nothing. A value
   * that holds nothing is `null`.
   */
  state(_node: GraphNode): Record<string, unknown> {
    return {};
  }

  /** Put the values `state` read back where this element keeps them. */
  setState(_node: GraphNode, _kept: Record<string, unknown>): void {}
}

/**
 * The key each result node's outputs are handed on under in a run's result,
 * by node id, in graph order: its label (`resultLabel`), or -- where an earlier
 * node already has that key -- the label with the node's id after it, and a
 * number after that while even that is taken. Two outputs under one label are
 * a problem `check` names; until it is fixed, neither value is dropped.
 *
 * Decided over the whole graph, not over the nodes a round ran, so a node's
 * key does not change with which ran beside it; and asked by the run and by
 * `check` alike, so what `check` says the keys are is what they are. Every key
 * is checked against every key handed out before it, so a label of the form
 * "Result (second)" never takes another's place.
 */
export function resultKeys(nodes: GraphNode[], kinds: Kinds): Map<string, string> {
  const keys = new Map<string, string>();
  const taken = new Set<string>();
  for (const node of nodes) {
    const kind = kinds.node(node.node_type);
    if (!kind?.isResult || keys.has(node.id)) continue;
    const label = kind.resultLabel(node);
    const told = `${label} (${node.id})`;
    let key = taken.has(label) ? told : label;
    for (let n = 2; taken.has(key); n += 1) key = `${told} ${n}`;
    taken.add(key);
    keys.set(node.id, key);
  }
  return keys;
}
