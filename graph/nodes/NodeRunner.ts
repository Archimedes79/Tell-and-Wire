// A node: the element branch that sits on the canvas and runs in the graph.
//
// Only a node authors anything: a body someone writes -- code, instructions --
// with files of its own in a project folder, and a way for an AI to write it.
// A block on a page shows or hands on what it holds, and writes nothing.

import type { DataType, Graph, GraphNode, NodeResult, NodeType, Port } from '../graph.ts';
import { collectedInterface, type Schema } from '../execution/interface.ts';
import { runsPerItem } from '../execution/batching.ts';
import type { Problem } from '../execution/wiring.ts';
import type { Logic } from '../authoring/logic.ts';
import type { Generation } from '../authoring/generation.ts';
import { definitionShape, type Definitions } from '../authoring/definition.ts';
import { ElementRunner } from './ElementRunner.ts';
import type { Runtime } from './Runtime.ts';

/**
 * Who starts an event: the page -- one of its blocks, so the graph needs a
 * page --, a call from outside -- a script, a model over MCP, the graph
 * above --, or the graph itself, when the tool starts and on a clock.
 */
export type StartedBy = 'page' | 'call' | 'itself';

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

/** What a deploy bundle must carry for this node to run elsewhere. */
export interface DeployNeeds {
  /** The bundle needs the page: the graph is used through it, not only from a terminal. */
  needsInterface: boolean;
  /**
   * It calls a model, so whoever receives the bundle needs a provider set up.
   *
   * Asked of the element rather than looked for by node type. A node that
   * holds a graph answers for itself; what is *inside* it is followed by
   * `bundleNeeds`, which walks the graphs.
   */
  asksAi: boolean;
}

/**
 * One piece of a node's writing, as a project folder keeps it: a file of its
 * own in the node's folder instead of a string inside its `node.json`.
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
 * What runs when a node runs, said for whoever reads its panel or the
 * documentation: the editor shows it at the foot of the node's panel.
 */
export interface WhatRuns {
  /**
   * `graph`: this class's `execute`, in the process that holds the graph.
   * `body`: a file in the node's own folder, run sandboxed (`graph/nodes/body.ts`).
   */
  by: 'graph' | 'body';
  /** The source file and method, or the body's file name in the node's folder. */
  where: string;
  /** One sentence: what it does with what arrives. */
  does: string;
}

/**
 * The elements, as anything that derives ports may need to ask about them: a
 * node holding a graph has to know which nodes inside it stand at its edge.
 * The registry answers this; so does a test with two elements in a map.
 */
export interface Runners {
  node(type: string): NodeRunner<unknown> | undefined;
}

export abstract class NodeRunner<C = unknown> extends ElementRunner<GraphNode, C> {
  // ── What it is ────────────────────────────────────────────────────────────
  // Its kind, its ports, the graph it may hold: asked whenever the graph is read.

  abstract readonly nodeType: NodeType;

  /**
   * What this node keeps in files of its own when its graph is a project
   * folder. Everything else it stores stays in its `node.json`.
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
   * ports follow from what it is -- one package on `data` --, a folder node's
   * from its settings -- `files`, `count`, and `error` when it catches --,
   * a data node's from the fields it holds, and a subgraph's from the graph
   * it holds. Nobody names those, and a copy of them in the editor is a copy
   * that can disagree with what the element emits.
   *
   * A code or AI node, or an end point, is the other kind: a person names its ports
   * to match the code they wrote or the prompt they gave. `count_per_file` has
   * an input called `file`; `total` produces `bla_count` and `summary`. Those
   * are the graph's, not the element's, and returning null says so — the test
   * that checks declarations against real graphs is what made the distinction
   * visible in the first place.
   */
  derivedPorts(_node: GraphNode, _elements: Runners): { inputs: Port[]; outputs: Port[] } | null {
    return null;
  }

  /**
   * The graph this node holds, or null for a node that holds none.
   *
   * The one question asked about hierarchy, and it is asked of the element so
   * that nothing else has to know which node type holds a graph. The project
   * folder recurses on it, `check` descends on it, a bundle follows it, and the
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
   * graph has for a page and for a call: there is one kind of way in and one
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
   * (`authoring/definition.ts`) -- or undefined for a kind that has none. A
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

  // ── Run time ──────────────────────────────────────────────────────────────
  // What a run asks. The executor owns the run; these are the questions it puts.

  /**
   * This node keeps what is delivered to it between rounds: it fills from what
   * arrives and forwards what it then holds, in the same round. Its passive
   * output (`Port.passive`) carries what it held when the round began, and a
   * wire from it is left out of the ordering (`passiveWires`), so a loop can
   * close. What arrived is kept when the round is over.
   */
  readonly isMemory: boolean = false;

  /** A round ran to its end: a node that counts rounds counts this one. Nothing, for most. */
  endRound(_node: GraphNode): void {}

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
   * What it hands on comes from outside the graph each time it runs -- a
   * folder's files -- and not from what arrives alone: what it made in an
   * earlier round is never handed back in its place (`reuse.ts`). A folder
   * listed again is cheap; one listed from before missed the file added since.
   */
  readonly readsOutside: boolean = false;

  /**
   * What this node offers whoever uses the graph from outside -- a page, a
   * script, the graph above: an event that starts a round, or an output it
   * hands back. Each under a name a caller uses, never a port:
   * `backend/gui-editor/graphInterface.ts` gathers them into the graph's own.
   */
  offers(_node: GraphNode): Offer[] {
    return [];
  }

  /** What this node hands back as the output it offers, from its result in a round. */
  shows(_node: GraphNode, _result: NodeResult): unknown {
    return undefined;
  }

  /**
   * Who starts this node's events: the page, a call from outside, or the
   * graph itself -- none, for a node that starts nothing. A graph the page or
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
   * What is wrong with this node where the graph above hands its value down
   * to it (`answerWith`) -- asked by the node holding the graph, which alone
   * knows that it is held (`SubgraphNodeRunner.problems`). Nothing, by default.
   */
  handedDownProblems(_node: GraphNode, _where: string): Problem[] {
    return [];
  }

  /** Run once, for inputs already collected from the wires. */
  abstract execute(
    node: GraphNode,
    inputs: Record<string, unknown>,
    runtime: Runtime,
  ): Promise<Record<string, unknown>>;

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
   * designed -- a data node's fields and its round count, what a start point
   * was sent. A session reads it after a round and puts it back before the
   * next (`setState`), on a copy, so that using a graph never changes its
   * design (`backend/gui-editor/session.ts`); a value whose design changed is
   * dropped, and only that one. Nothing, for a node that keeps nothing. A value
   * that holds nothing is `null`.
   */
  state(_node: GraphNode): Record<string, unknown> {
    return {};
  }

  /** Put the values `state` read back where this element keeps them. */
  setState(_node: GraphNode, _kept: Record<string, unknown>): void {}

  // ── Build time ────────────────────────────────────────────────────────────
  // What only building asks: the editor, `check`, `test`, a bundle being made.
  // It travels with the class -- one class per kind is worth more than a
  // smaller tool -- but nothing a run calls may reach it (`backend/app/times.test.ts`).

  /**
   * How an AI writes this node's body, or undefined if none does: a code
   * node's code, an ai node's instructions, a data node's data. A start point,
   * a folder node or an end point holds settings.
   */
  generation(): Generation | undefined {
    return undefined;
  }

  /**
   * What a bundle must carry for this node to run somewhere else.
   *
   * Every body may ask a model (`body.ts`), so every body is looked at, and any
   * mention counts -- `node.llm(`, `{ llm }`, `const ask = node.llm`: a README
   * that explains the model to someone who turns out not to need it costs less
   * than a tool that stops at its first question.
   */
  deployNeeds(node: GraphNode): DeployNeeds {
    const logic = this.logic(node);
    return { needsInterface: false, asksAi: logic !== undefined && /\bllm\b/.test(logic.body) };
  }

  /**
   * What someone writing a graph for this kind must know about its settings:
   * which keys hold what it does, and what goes wrong if they are put anywhere
   * else. A sentence or a paragraph, without a heading -- the prompt that
   * designs a whole graph (`backend/graph-editor/graphPrompt.ts`) collects one from
   * every kind, so a new kind is described in its own file.
   *
   * None means a generated graph is not meant to use this kind, and it is left
   * out of what the model is told exists.
   */
  graphAuthorNote(): string | undefined {
    return undefined;
  }

  /**
   * What runs when this node runs: where that code is, and in one sentence what
   * it does. Every kind says it, so every node's folder and panel can -- the
   * executing class is otherwise nowhere a person building a graph looks.
   */
  whatRuns(_node: GraphNode): WhatRuns {
    // Every kind in the registry says more than this (`times.test.ts`).
    return this.graphRuns('');
  }

  /**
   * This class's own `execute`, named by where the element-first layout puts
   * it. Spelled from the node type, never from `constructor.name`: in the
   * editor's bundle a class is called `Kg`.
   */
  protected graphRuns(does: string): WhatRuns {
    const kind = this.nodeType.charAt(0).toUpperCase() + this.nodeType.slice(1);
    return { by: 'graph', where: `graph/nodes/${this.nodeType}/${kind}NodeRunner.ts › execute`, does };
  }

  /**
   * What is wrong with this node that only this element can say.
   *
   * `check` finds what any node can get wrong -- an edge to a port that is not
   * there, a cycle, an interface naming a lost output. What is *this kind of
   * node's* own contract belongs here, in the file that defines it: a node
   * holding a graph knows what may and may not stand at that graph's edge, and
   * the project checker should not have to.
   *
   * Nothing recursive: `check` walks the graphs, this speaks about one node.
   * *wired* is which of its inputs something is wired into: a setting a wire
   * stands in for is no setting missing.
   */
  problems(_node: GraphNode, _elements: Runners, _where: string, _wired: ReadonlySet<string> = new Set()): Problem[] {
    return [];
  }

  /**
   * Running this node asks a model: its examples are skipped by an offline
   * `test`.
   *
   * The same question `deployNeeds` answers for a bundle, so it is asked once
   * and read twice. Held apart, they disagreed: `deployNeeds` looks at the
   * body and sees `node.llm(`, this was a constant and said no -- so a bundle
   * told its recipient to configure a provider while `test --offline` ran that
   * same body into a model that was never there.
   */
  asksModel(node: GraphNode): boolean {
    return this.deployNeeds(node).asksAi;
  }

  /**
   * Files and folders this node names as its own defaults: the CSV a picker
   * starts on, the folder a folder node lists.
   *
   * A bundle carries them. A tool handed to someone with its default file left
   * behind opens on an error, and the person it was handed to has no way to
   * know which file on someone else's machine it wanted.
   */
  referencedPaths(_node: GraphNode): string[] {
    return [];
  }

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
export function resultKeys(nodes: GraphNode[], elements: Runners): Map<string, string> {
  const keys = new Map<string, string>();
  const taken = new Set<string>();
  for (const node of nodes) {
    const element = elements.node(node.node_type);
    if (!element?.isResult || keys.has(node.id)) continue;
    const label = element.resultLabel(node);
    const told = `${label} (${node.id})`;
    let key = taken.has(label) ? told : label;
    for (let n = 2; taken.has(key); n += 1) key = `${told} ${n}`;
    taken.add(key);
    keys.set(node.id, key);
  }
  return keys;
}
