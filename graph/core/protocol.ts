// What the wrapper asks of a graph core, and what a core answers.
//
// A graph core is the one part of Tell-and-Wire that runs graphs: it takes the
// graph definition -- nodes, their files, the wires; never the page -- and
// executes it in its language, asking the model with a client of its own. It
// can live in the wrapper's process (`localCore.ts`) or be a program of its
// own that speaks this protocol on stdin and stdout (`stdio.ts`), one JSON
// object per line. Everything a page, a script or the editor sees goes through
// the wrapper (`host/`), never to a core directly.
//
// What stays the wrapper's: the session -- what nodes keep between rounds, the
// page and what its blocks hold, state.json, the clock, the queue of rounds --
// and the graph definition's own rules: start points, end points, packages.
// What is the core's: running a round, one node, a node's example; what every
// node made last (the latch); the reuse cache, which only saves time.
//
// The wire, both ways one JSON object per line:
//
//   wrapper -> core   { "id": 7, "op": "round", ...RoundAsked }
//   core -> wrapper   { "id": 7, "event": { "type": "node_start", "node_id": "read" } }   any number
//                     { "id": 7, "reply": { ...RoundEnded } }                             once, or:
//                     { "id": 7, "error": "what went wrong" }
//
// `stop` names the request it stops (`of`); the stopped one still replies --
// a round stopped halfway with what it had, marked cancelled. A core writes
// nothing else on stdout; what it has to say for people goes to stderr.
//
// What any core must do, whatever its language:
// - Answer `hello` first and at once; the wrapper refuses one that does not
//   (15 s), or speaks another `protocol`.
// - Read requests while one goes: a `stop` arrives in the middle of a round.
// - Run where the wrapper runs, on the same files: paths in a graph are
//   resolved against the same working directory.
// - Keep, between rounds, what every node made last -- `held` comes in with
//   `open` from state.json and goes back with every round, an opaque value the
//   wrapper only stores -- and commit what a round left only when it ran to
//   its end.
// - Say in `nodes` each node's state, keyed as its kind keeps it: a start
//   point `values`, a data node `data_value` (`NodeRunner.state`).
// - Run a round with `given` as a kept round: those nodes are handed their
//   outputs instead of running, and nothing of it stands for the next round --
//   no latch, no reuse.
// - End when stdin ends, stopping what still goes. An error is a sentence.

import type { ExecutionResult, Graph, NodeResult } from '../graph.ts';
import type { ProgressEvent } from '../nodes/Runtime.ts';
import type { Trigger } from '../execution/triggers.ts';
import type { Held } from '../execution/latch.ts';
import type { ExampleRun } from '../authoring/examples.ts';

/** The protocol's version: a core that speaks another is refused at `hello`. */
export const PROTOCOL = 1;

/** Every operation a core answers. */
export const OPERATIONS = ['hello', 'open', 'round', 'node', 'example', 'test', 'arriving', 'forget', 'stop'] as const;

/** Who answers: what `hello` replies. */
export interface CoreHello {
  protocol: number;
  /** The language graphs run in there: "javascript". */
  language: string;
  /** What it is, for a person: "Tell-and-Wire JavaScript core". */
  core: string;
}

/** A round of a graph. */
export interface RoundAsked {
  /**
   * The graph as the round starts from it: what nodes keep put back into
   * them, what the round was sent put into the start points it reaches
   * (`NodeRunner.startWith`). The core runs a copy and changes nothing here.
   */
  graph: Graph;
  /** The start point it begins at; none, a round of the whole graph. */
  trigger: Trigger | null;
  /** Nodes whose outputs are known already -- a kept round's answers: they do not run. */
  given?: Record<string, Record<string, unknown>>;
  /** Ask no model: a node that would fails, as a kept round's replay wants it. */
  offline?: boolean;
}

/** What a round left. */
export interface RoundEnded {
  result: ExecutionResult;
  /** What every node keeps after it (`NodeRunner.state`), by node id: the wrapper keeps what differs from the design. */
  nodes: Record<string, Record<string, unknown>>;
  /** What every node of the graph was last left holding, for state.json: nothing new when the round was stopped. */
  held: Record<string, Held>;
}

/** One node by itself: on *inputs*, or -- without -- on what the nodes feeding it produce. */
export interface NodeAsked {
  graph: Graph;
  node: string;
  inputs?: Record<string, unknown>;
}

/** One node on the example its definitions hold, held to them. */
export interface ExampleAsked {
  graph: Graph;
  node: string;
  offline?: boolean;
}

/** Every node's example, at every depth -- or only the nodes with the id *only*. */
export interface TestAsked {
  graph: Graph;
  offline?: boolean;
  only?: string;
}

/** What `test` replies: each node it tried, with the way down to it (`outer ▸ `). */
export interface Tested {
  tested: number;
  results: { inside: string; nodeId: string; result: ExampleRun }[];
}

/** What would arrive at one node, were the graph run up to it now. */
export interface ArrivingAsked {
  graph: Graph;
  node: string;
}

/** How far a request is: the executor's progress, and -- first, for a round -- how many nodes it runs. */
export type CoreEvent = ProgressEvent | { type: 'plan'; total: number };

/** Every request, as it goes over the wire. */
export type CoreRequest =
  | { id: number; op: 'hello' }
  | { id: number; op: 'open'; held?: Record<string, Held> }
  | ({ id: number; op: 'round' } & RoundAsked)
  | ({ id: number; op: 'node' } & NodeAsked)
  | ({ id: number; op: 'example' } & ExampleAsked)
  | ({ id: number; op: 'test' } & TestAsked)
  | ({ id: number; op: 'arriving' } & ArrivingAsked)
  | { id: number; op: 'forget' }
  | { id: number; op: 'stop'; of: number };

/** Every answer, as it goes over the wire. */
export type CoreAnswer =
  | { id: number; event: CoreEvent }
  | { id: number; reply: unknown }
  | { id: number; error: string };

/**
 * A graph core, as the wrapper holds one: one per session, since what nodes
 * made last lives in it between rounds. *report* is told how far a request
 * is; *signal* stops it.
 */
export interface GraphCore {
  hello(): Promise<CoreHello>;
  /** Begin anew, with what state.json says every node was last left holding. */
  open(held?: Record<string, Held>): Promise<void>;
  round(asked: RoundAsked, report?: (event: CoreEvent) => void, signal?: AbortSignal): Promise<RoundEnded>;
  node(asked: NodeAsked, signal?: AbortSignal): Promise<{ inputs: Record<string, unknown>; result: NodeResult }>;
  example(asked: ExampleAsked, signal?: AbortSignal): Promise<ExampleRun>;
  test(asked: TestAsked, signal?: AbortSignal): Promise<Tested>;
  arriving(asked: ArrivingAsked, signal?: AbortSignal): Promise<{ inputs: Record<string, unknown>; upstream: ExecutionResult }>;
  /** Forget what it keeps between rounds: a reset. */
  forget(): Promise<void>;
  /** Let it go: a core of its own process ends. */
  close(): Promise<void>;
}
