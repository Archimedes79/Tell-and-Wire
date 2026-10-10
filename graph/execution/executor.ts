// Running a graph: initialise, wire, order, execute.
//
// The whole of it is four ideas.
//
// **Order.** Kahn's algorithm over the edges gives levels: nothing in a level
// feeds anything else in it. The nodes run one after another, level by level
// and in the graph's own node order inside one, so a run is reproducible.
//
// **Memory.** A tool remembers in a data node, which fills from what arrives
// and then forwards what it holds, in the same round. A graph with a loop — a
// counter: a data node, and a code node adding one to it — is not a mistake, it
// is how a tool remembers. The node that reads the memory takes its passive
// output (`Port.passive`): the wire from it is left out of the ordering, so
// what remains is acyclic, and carries what the node held when the round
// began; what arrives is kept when the round ends. A loop without one is an
// error (`order.ts`).
//
// **Collection.** A node's inputs are whatever its upstream neighbours put on
// the wires. A port fed by several edges collects a list; a port whose single
// source failed gets nothing rather than a null, so a failure upstream does not
// look like a successfully computed nothing.
//
// **Batching.** A node marked per-item runs once per element of its list input,
// bounded, and a failing item costs that item rather than the batch.
//
// Everything else — what a node *does* — belongs to its element.

import type { Graph, GraphEdge, GraphNode, ExecutionResult, NodeResult, Port } from '../graph.ts';
import { resultKeys, type NodeRunner, type Runners } from '../nodes/NodeRunner.ts';
import type { Runtime } from '../nodes/Runtime.ts';
import { atMost, batchItems, mergeBatchOutputs, reconcileOutputs } from './batching.ts';
import { Unread, filePorts, readPorts } from './fileInputs.ts';
import { RUN_PORT, firedNodes, neededFor, triggeredNodes, type Trigger } from './triggers.ts';
import { passiveWires, nodeName, topologicalLevels } from './order.ts';
import type { LastOutputs } from './reuse.ts';
import type { Latch } from './latch.ts';
import { mismatches } from './interface.ts';
import { ERROR_PORT, fatalProblems, unrunnable } from './wiring.ts';

/**
 * The value under *field* -- a path, `folder` or `file.content` -- of what
 * arrived: of a start point's package, one of the values its sender sent; of
 * anything else, a key of it. Nothing there is undefined: nothing arrived.
 */
export function fieldOf(value: unknown, field: string): unknown {
  const isPackage = !!value && typeof value === 'object' && 'event' in value && 'values' in value;
  let at: unknown = isPackage ? (value as { values: unknown }).values : value;
  for (const key of field.split('.')) {
    if (!at || typeof at !== 'object') return undefined;
    at = (at as Record<string, unknown>)[key];
  }
  return at;
}

/**
 * Gather what the wires deliver to *nodeId*.
 *
 * A port fed by more than one edge always collects a list, even when some
 * sources failed — those contribute nothing rather than a null placeholder, so
 * surviving values are not diluted. A port fed by one edge whose source failed
 * yields no entry at all, which is different from a source that succeeded with
 * a null. A port of *ports* that takes one value of what arrives (`Port.field`)
 * is handed that value.
 */
function collectInputs(
  nodeId: string,
  edges: GraphEdge[],
  outputs: Map<string, Record<string, unknown>>,
  ports: readonly Port[] = [],
  /** A wire that delivers nothing, however much its source made: for a node that remembers, a source that failed and caught it. */
  delivers: (edge: GraphEdge) => boolean = () => true,
): Record<string, unknown> {
  const fields = new Map(ports.filter((port) => port.field).map((port) => [port.id, port.field!]));
  const byPort = new Map<string, GraphEdge[]>();
  for (const e of edges) {
    if (e.target_node_id !== nodeId || !delivers(e)) continue;
    // A run edge says when, not what: it orders the node and delivers nothing.
    if (e.target_port_id === RUN_PORT) continue;
    byPort.set(e.target_port_id, [...(byPort.get(e.target_port_id) ?? []), e]);
  }

  const collected: Record<string, unknown> = {};
  for (const [port, incoming] of byPort) {
    const values: unknown[] = [];
    for (const edge of incoming) {
      const source = outputs.get(edge.source_node_id);
      if (source === undefined) continue;
      const field = fields.get(port);
      values.push(field ? fieldOf(source[edge.source_port_id], field) : source[edge.source_port_id]);
    }
    if (incoming.length > 1) collected[port] = values;
    else if (values.length) collected[port] = values[0];
  }
  return collected;
}

export interface RunOptions {
  /** Wired file paths are read into text for elements that asked. */
  runtime: Runtime;
  registry: Runners;
  /**
   * The event that started this run: a start point. With one, only what it is
   * wired to runs, plus whatever those nodes need -- see `triggers.ts`.
   */
  trigger?: Trigger | null;
  /**
   * Ends the run early: no further node starts, and the model call or body in
   * flight is ended rather than waited for. What had finished keeps its result.
   */
  signal?: AbortSignal;
  /** Run these nodes and no others. How `inputsFor` asks for one node's upstream. */
  only?: Set<string>;
  /**
   * What nodes produced before, for the ones this run needs only as context:
   * upstream of what an event is for, or of the node `inputsFor` asks
   * about. See `reuse.ts`. Absent, everything runs.
   */
  reuse?: LastOutputs;
  /**
   * Nodes whose result is already known: they do not run, and what is here is
   * what the rest of the graph receives from them.
   *
   * The same idea as `reuse`, without the cache and without the conditions --
   * a caller who already has the answer says so. It is how a graph inside a
   * node is handed the values that arrived on that node's ports: its start
   * points are answered rather than run.
   */
  given?: Record<string, Record<string, unknown>>;
  /**
   * What every node last produced, for the rounds in which its ◆ stays shut.
   * See `latch.ts`. Absent -- a single run from the command line -- a node
   * whose gate is shut has nothing to hand on, and what needs it waits.
   */
  latch?: Latch;
  /** How many graphs this run is already inside. Set by the executor, for itself. */
  depth?: number;
}

/**
 * What running one node by itself honours: its services, a stop, and how deep
 * it already is. No event, no slice of the graph, nothing held or reused: it
 * is one node, asked directly.
 */
export type NodeRunOptions = Pick<RunOptions, 'runtime' | 'registry' | 'signal' | 'depth'>;

/**
 * Run the graph once.
 *
 * A node that throws is recorded as failed and its dependents are skipped
 * rather than the run being abandoned: the report should say what happened
 * everywhere, not only where it stopped first.
 */
export async function executeGraph(graph: Graph, options: RunOptions): Promise<ExecutionResult> {
  const { registry } = options;
  // Before anything runs: an edge that ends nowhere delivers nothing and fails
  // nothing, so a run that went ahead would report a result computed without
  // it. Said here rather than in each caller -- `check` says the same thing
  // about the same graph before it is ever run, and more of it.
  const broken = fatalProblems(graph);
  if (broken.length) throw new Error(unrunnable(broken));
  const { signal } = options;
  const depth = options.depth ?? 0;
  const runtime = stoppable(options.runtime, signal);
  const { nodes, edges } = graph;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const reads = passiveWires(nodes, edges, registry);
  const levels = topologicalLevels(nodes, edges, registry);
  const only = options.only ?? (options.trigger ? triggeredNodes(graph, options.trigger, registry) : null);
  // Context, as opposed to what this run is for: only in a run that is not
  // the whole graph, never the node that fired, never what it fired, and
  // never a node with nothing wired in -- that one reads the outside world.
  const fired = options.trigger && !options.only ? firedNodes(graph, options.trigger, registry) : null;
  const context = (nodeId: string): boolean => !!options.reuse && !!only
    && nodeId !== options.trigger?.node_id && !fired?.has(nodeId)
    && edges.some((e) => e.target_node_id === nodeId && e.target_port_id !== RUN_PORT && !reads.has(e.id));
  // Which model answers is part of what a node depends on (`reuse.ts`): asked once for the round.
  const setting = options.reuse ? await runtime.ai.setting?.() : undefined;

  // Which event this round is. A run no event started counts every one as
  // having happened: that is what "run everything" means, and what lets a
  // graph inside a node, or one node's upstream, run without anybody starting it.
  const fires = (nodeId: string, portId: string): boolean => {
    const node = byId.get(nodeId);
    if (!node || !registry.node(node.node_type)?.eventPorts(node).includes(portId)) return false;
    const event = options.trigger;
    if (!event) return true;
    return event.node_id === nodeId && (!event.port_id || event.port_id === portId);
  };

  const outputs = new Map<string, Record<string, unknown>>();
  // A memory a wire reads round a loop has not run when that wire is read: it hands on what it held when the round began.
  for (const id of new Set(edges.filter((e) => reads.has(e.id)).map((e) => e.source_node_id))) {
    const node = byId.get(id)!;
    outputs.set(id, await registry.node(node.node_type)!.execute(node, {}, runtime));
  }
  // Nodes whose outputs this round are the ones they were left holding: not
  // run, so not settled into memory again and not a reason for anything to run.
  const held = new Set<string>();
  const results: NodeResult[] = [];
  const failed = new Set<string>();
  const partial = new Set<string>();
  // Nodes that threw and caught it: nulls on every port but `error`, nothing for memory to keep.
  const caught = new Set<string>();
  // Nodes that had nothing to do. Not a failure and not a success: a chat
  // opened and ▶ Run pressed before anyone has said anything.
  const idle = new Set<string>();

  const dependsOn = (nodeId: string, those: Set<string>): boolean =>
    edges.some((e) => e.target_node_id === nodeId && !reads.has(e.id) && those.has(e.source_node_id));

  /** This node's view of the run: which of *its* ports the round began with. */
  const atNode = (base: Runtime, nodeId: string): Runtime => ({ ...base, fired: (portId) => fires(nodeId, portId) });

  /** Its outputs come from what it holds, not only from what reaches it. */
  const keepsItsOwn = (nodeId: string): boolean => {
    const node = byId.get(nodeId);
    const element = node && registry.node(node.node_type);
    return !!node && !!element && (element.isMemory || element.eventPorts(node).length > 0);
  };

  /** Where the latch keeps what this node made: see `latch.ts`. */
  const latchKey = (node: GraphNode): string => options.latch!.key(graph, node, (from) => keepsItsOwn(from.id));

  /**
   * Why this node stands still this round, or '' when it runs.
   *
   * Only what happened *in this round* opens a gate: a boolean a node was left
   * holding from an earlier one is a moment that has passed.
   */
  const standsStill = (nodeId: string): string => {
    const into = edges.filter((e) => e.target_node_id === nodeId);
    const gates = into.filter((e) => e.target_port_id === RUN_PORT);
    if (gates.length) {
      // The event itself opens the node it is wired to, whichever port the wire
      // ends on: a start point wired into a node's input, not into its ◆, must
      // still run a node whose ◆ another start point opens as well.
      const open = into.some((e) => fires(e.source_node_id, e.source_port_id))
        || gates.some((e) => !held.has(e.source_node_id) && outputs.get(e.source_node_id)?.[e.source_port_id] === true);
      return open ? '' : 'Nothing opened its ◆ this round.';
    }
    // A node that keeps something of its own -- a data node, a start point --
    // is news by itself: the event that began the round is in the start point,
    // whatever wires into it carry.
    if (keepsItsOwn(nodeId)) return '';
    const data = into.filter((e) => outputs.has(e.source_node_id));
    if (data.length && data.every((e) => held.has(e.source_node_id))) return 'Nothing new reached it this round.';
    return '';
  };

  /** A node's result, and the node done: each one the round was asked for is counted once, ran or not. */
  const finish = (result: NodeResult): void => {
    results.push(result);
    runtime.report?.({ type: 'node_done', node_id: result.node_id, status: result.status });
  };

  // Answered before anything is asked. Put in before the levels rather than
  // inside them, because a node whose result is already known has nothing the
  // loop does to it: no element to find, no upstream failure to inherit, no
  // "nothing to do" to decide, and nothing to report as started.
  const given = new Set<string>();
  for (const [nodeId, produced] of Object.entries(options.given ?? {})) {
    if (!byId.has(nodeId)) throw new Error(`Given a result for "${nodeId}", which is not a node in this graph.`);
    given.add(nodeId);
    outputs.set(nodeId, produced);
    results.push({
      node_id: nodeId, status: 'success', inputs: {}, outputs: produced, error: null,
      messages: ['Handed in from outside: this node was not run.'],
    });
  }

  for (const level of levels) {
    for (const nodeId of level) {
      // Not part of what this event started: left alone, and left out of the
      // report too -- it did not fail and it was not skipped, it was not asked.
      if (only && !only.has(nodeId)) continue;
      if (given.has(nodeId)) continue;
      if (signal?.aborted) continue;
      const node = byId.get(nodeId)!;
      const element = registry.node(node.node_type);

      if (!element) {
        failed.add(nodeId);
        finish({
          node_id: nodeId, status: 'error', inputs: {}, outputs: {},
          error: `Unknown node type: ${node.node_type}`,
        });
        continue;
      }

      if (dependsOn(nodeId, failed)) {
        failed.add(nodeId);
        // Which one, by the name on the canvas: the first that failed of what it waits for.
        const before = edges.find((e) => e.target_node_id === nodeId && !reads.has(e.id) && failed.has(e.source_node_id));
        const culprit = before && byId.get(before.source_node_id);
        const message = culprit ? `${nodeName(culprit)} failed before it, so it could not run.` : 'Something before it failed, so it could not run.';
        finish({ node_id: nodeId, status: 'skipped', inputs: {}, outputs: {}, error: null, messages: [message] });
        continue;
      }

      // What a node that remembers is not handed: the nulls of a source that failed and caught it -- "nothing arrived", not a value to keep.
      const inputs = collectInputs(nodeId, edges, outputs, node.inputs,
        (e) => !(element.isMemory && caught.has(e.source_node_id) && e.source_port_id !== ERROR_PORT));

      // The ◆ is a gate. Wired, it must be opened by this round: by the event
      // the round began with, or by a `true` some node computed in it. Shut,
      // the node does not run and what it last produced stands. The same goes
      // for a node fed only by nodes that stood still: nothing new reached it.
      const shut = standsStill(nodeId);
      if (shut) {
        const kept = options.latch?.get(latchKey(node));
        if (kept) {
          held.add(nodeId);
          outputs.set(nodeId, kept);
          finish({ node_id: nodeId, status: 'skipped', inputs, outputs: kept, held: true, error: null, messages: [`${shut} What it produced last stands.`] });
        } else {
          idle.add(nodeId);
          finish({ node_id: nodeId, status: 'skipped', inputs, outputs: {}, error: null, messages: [`${shut} It has produced nothing yet, so what needs it waits.`] });
        }
        continue;
      }

      // A wired input the node declared it cannot do without, and nothing on
      // it: the node has nothing to do, and neither has what hangs off it.
      // Sending a model "User:" followed by nothing is not a question. Except a
      // node that keeps something of its own: a start point's package, a data
      // node's value, is news whatever an idle neighbour did not send.
      const why = dependsOn(nodeId, idle) && !keepsItsOwn(nodeId)
        ? 'What feeds this node had nothing to do, so neither had this.'
        : nothingToDo(element, node, inputs, edges);
      if (why) {
        idle.add(nodeId);
        finish({ node_id: nodeId, status: 'skipped', inputs, outputs: {}, error: null, messages: [why] });
        continue;
      }

      runtime.report?.({ type: 'node_start', node_id: nodeId });

      try {
        // What the run reports having received is what came off the wires --
        // the paths, not the megabytes behind them. Only the element sees the
        // contents.
        const arrived = await readInputs(element, node, inputs, runtime, registry);
        // An event is a moment: a package handed back from an earlier round
        // would say an event happened that is over.
        const key = element.eventPorts(node).length ? undefined : options.reuse?.key(node, arrived, setting);
        const kept = key && context(nodeId) ? options.reuse!.get(key) : undefined;
        if (kept) {
          outputs.set(nodeId, kept);
          // What it hands on now is what it made last, for a later round its ◆ stays shut in.
          options.latch?.set(latchKey(node), kept);
          finish({
            node_id: nodeId, status: 'success', inputs, outputs: kept, error: null, reused: true,
            messages: ['Reused from an earlier run: nothing it depends on has changed.'],
          });
          continue;
        }
        const { produced, failures } = await runNode(
          element, node, arrived, withSubgraph(atNode(runtime, nodeId), options, node, depth), signal,
        );
        if (signal?.aborted) throw new Error('Stopped.');
        outputs.set(nodeId, produced);
        if (!failures.length) options.latch?.set(latchKey(node), produced);
        // Kept only when it went through whole: a partial result is not one to hand back.
        if (key && !failures.length) options.reuse!.set(key, produced);
        const result = ranTo(element, node, inputs, produced, failures);
        if (result.status === 'partial') partial.add(nodeId);
        finish(result);
      } catch (error) {
        // Stopped in the middle of this node: not the node's failure, and not
        // something a catch-errors port should turn into data.
        if (signal?.aborted) {
          finish({ node_id: nodeId, status: 'skipped', inputs, outputs: {}, error: null, messages: ['Stopped.'] });
          continue;
        }
        const result = failedWith(element, node, inputs, error);
        if (result.status === 'partial') {
          outputs.set(nodeId, result.outputs);
          partial.add(nodeId);
          caught.add(nodeId);
        } else {
          failed.add(nodeId);
        }
        finish(result);
      }
    }
  }

  // What stood still is not news: a reply held from the last round must not be
  // added to the conversation a second time, nor handed back as this round's result.
  for (const nodeId of held) outputs.delete(nodeId);
  const took = settleMemory(graph, outputs, results, registry, caught);
  // One round more, for whatever counts them and took part: stopped halfway, it is none.
  if (!signal?.aborted) for (const node of nodes) if (took.has(node.id)) registry.node(node.node_type)?.endRound(node);

  const status: ExecutionResult['status'] = signal?.aborted
    ? 'cancelled'
    : failed.size === 0 && partial.size === 0
      ? 'success'
      : failed.size === (only?.size ?? nodes.length) ? 'error' : 'partial';

  return {
    status,
    node_results: results,
    outputs: finalOutputs(nodes, outputs, registry),
    error: failed.size ? failureSummary(results, byId, failed) : null,
  };
}

/**
 * The runtime of a run that can be stopped.
 *
 * The signal is put on every model call and handed to every body here, once,
 * so no element has to know that stopping exists -- the same place the graph's
 * AI default is applied, for the same reason.
 */
function stoppable(runtime: Runtime, signal: AbortSignal | undefined): Runtime {
  if (!signal) return runtime;
  const { tools } = runtime;
  return {
    ...runtime,
    ai: { ...runtime.ai, complete: (request) => runtime.ai.complete({ ...request, signal }) },
    code: { run: (body, inputs, _signal, context) => runtime.code.run(body, inputs, signal, context) },
    ...(tools ? { tools: { open: (servers) => tools.open(servers, signal) } } : {}),
  };
}

/**
 * How deep a graph may hold a graph.
 *
 * Not a technical ceiling -- nothing here recurses on the stack -- but the
 * depth past which a person has lost the thread, and the thing that ends a
 * graph that somehow came to hold itself.
 */
export const NESTING_LIMIT = 5;

/**
 * The runtime a node that holds a graph is handed: the same one, plus the way
 * to run that graph.
 *
 * Made per node rather than per run, because the inner run's progress is the
 * *outer* node's progress. A page watching a run counts what it was told to
 * expect ("3 of 7"), and inner nodes it never heard of would count past the
 * end; they are forwarded as activity of the node they happened inside.
 */
function withSubgraph(runtime: Runtime, options: NodeRunOptions, node: GraphNode, depth: number): Runtime {
  const inner: Runtime = {
    ...runtime,
    ...(runtime.report ? {
      report: (event) => {
        if (event.type === 'node_start' || event.type === 'node_done') return;
        runtime.report!({ ...event, node_id: node.id });
      },
    } : {}),
  };
  return {
    ...runtime,
    subgraph: {
      elements: options.registry,
      run: (graph, given) => {
        if (depth + 1 > NESTING_LIMIT) {
          throw new Error(`Graphs may hold graphs ${NESTING_LIMIT} deep; "${node.id}" is one deeper than that.`);
        }
        return executeGraph(graph, {
          ...options,
          runtime: inner,
          given,
          depth: depth + 1,
          // The inner graph runs whole. An event and a single-node run are
          // asked at the level they were asked at, and mean nothing here.
          trigger: null,
          only: undefined,
          // Nothing is held in there: the same inner graph may sit in two
          // nodes, or run once per item, and one's last value is not another's.
          latch: undefined,
          reuse: undefined,
        });
      },
    },
  };
}

/** Whether a value is nothing: not delivered, empty text, a list of nothing -- two empty boxes wired into one port. */
function isNothing(value: unknown): boolean {
  return value === null || value === undefined || value === ''
    || (Array.isArray(value) && value.every(isNothing));
}

/**
 * Why this node has nothing to do this round, or '' when it has.
 *
 * Two ways to have nothing to do. A port marked required is wired and brought
 * nothing. Or the element is one that works *on* its inputs (`needsInput`: an
 * ai node) and every wire into it came up empty -- ▶ Run on a chat nobody has
 * typed into, a summarizer before a file is chosen.
 *
 * Only *wired* ports count, both times. An unwired one is how the node was
 * built -- an ai node with nothing but instructions is a legitimate thing to
 * make -- while a wired one that came up empty is this round having nothing to
 * say.
 */
function nothingToDo(
  element: NodeRunner<unknown>,
  node: GraphNode,
  inputs: Record<string, unknown>,
  edges: GraphEdge[],
): string {
  const wired = new Set(edges
    .filter((e) => e.target_node_id === node.id && e.target_port_id !== RUN_PORT)
    .map((e) => e.target_port_id));

  for (const port of node.inputs) {
    if (port.required && wired.has(port.id) && isNothing(inputs[port.id])) {
      return `Nothing arrived on "${port.name || port.id}", which this node needs -- so it had nothing to do.`;
    }
  }
  if (element.needsInput(node) && wired.size && [...wired].every((id) => isNothing(inputs[id]))) {
    return 'Nothing arrived on any of its inputs, so there was nothing to ask.';
  }
  return '';
}

/**
 * One node's inputs, obtained by running what feeds it -- and not the node.
 *
 * For trying a node out before the graph has ever run: the file is picked, the
 * CSV parsed, and what would arrive at this node is handed back, without the
 * model call or the chart the node itself would cost. What computes the ◆ of
 * what feeds it runs too (`neededFor`), or that never opens.
 */
export async function inputsFor(
  graph: Graph,
  nodeId: string,
  options: RunOptions,
): Promise<{ inputs: Record<string, unknown>; upstream: ExecutionResult }> {
  const into = graph.edges.filter((e) => e.target_node_id === nodeId && e.target_port_id !== RUN_PORT);
  const only = neededFor(graph, into.map((e) => e.source_node_id).filter((id) => id !== nodeId), options.registry);
  only.delete(nodeId);

  const upstream = await executeGraph(graph, { ...options, trigger: null, only });
  const produced = new Map(upstream.node_results.map((r) => [r.node_id, r.outputs]));
  const node = graph.nodes.find((one) => one.id === nodeId);
  return { inputs: collectInputs(nodeId, graph.edges, produced, node?.inputs), upstream };
}

/**
 * Run one node by itself, on inputs someone supplies.
 *
 * For trying a node out while writing it: the prompt against last run's
 * values, or against a sentence typed for the purpose. It goes through the
 * same steps a node in a run does -- wired files read into text, fan-out over
 * a list -- because a test that skipped one of them would pass on something
 * the run then does differently.
 *
 * Nothing is settled and nothing downstream runs. A failure is the result,
 * not an exception: the person asked what this node does with these inputs,
 * and "it fails, like this" is an answer -- the answer a run would give: a
 * node with nothing to do stands still, one that catches its failures puts
 * them on its error port, and what does not fit its output.js is said.
 */
export async function executeNode(
  graph: Graph,
  nodeId: string,
  inputs: Record<string, unknown>,
  options: NodeRunOptions,
): Promise<NodeResult> {
  const node = graph.nodes.find((n) => n.id === nodeId);
  const element = node && options.registry.node(node.node_type);
  if (!node || !element) {
    return { node_id: nodeId, status: 'error', inputs, outputs: {}, error: `No such node: ${nodeId}` };
  }
  const why = nothingToDo(element, node, inputs, graph.edges);
  if (why) return { node_id: nodeId, status: 'skipped', inputs, outputs: {}, error: null, messages: [why] };
  const runtime = stoppable(options.runtime, options.signal);
  try {
    const arrived = await readInputs(element, node, inputs, runtime, options.registry);
    const { produced, failures } = await runNode(
      element, node, arrived, withSubgraph(runtime, options, node, options.depth ?? 0), options.signal,
    );
    return ranTo(element, node, inputs, produced, failures);
  } catch (error) {
    return failedWith(element, node, inputs, error);
  }
}

/**
 * One call of a node's body on *inputs* as the body is handed them -- the
 * example in its input.js: no file is read, because the example already holds
 * what a read file gives, and nothing fans out, because the example is one
 * item. What one call returns is what its output.js describes, so it comes
 * back as the call returned it, to be held to that (`examples.ts`).
 */
export async function callNode(
  graph: Graph,
  nodeId: string,
  inputs: Record<string, unknown>,
  options: NodeRunOptions,
): Promise<NodeResult> {
  const node = graph.nodes.find((n) => n.id === nodeId);
  const element = node && options.registry.node(node.node_type);
  if (!node || !element) {
    return { node_id: nodeId, status: 'error', inputs, outputs: {}, error: `No such node: ${nodeId}` };
  }
  try {
    const runtime = withSubgraph(stoppable(options.runtime, options.signal), options, node, options.depth ?? 0);
    const outputs = reconcileOutputs(node, await element.execute(node, inputs, runtime));
    return { node_id: nodeId, status: 'success', inputs, outputs, error: null };
  } catch (error) {
    return failedWith(element, node, inputs, error);
  }
}

/**
 * What a node that ran comes to. Some items failed and the rest went through:
 * partial, and said, rather than a success whose gaps are nulls nobody
 * explains. What does not fit its output definition is said, not enforced:
 * the values are what they are, but a node that broke it is named here rather
 * than blamed three nodes later by whatever read the wrong shape.
 */
function ranTo(
  element: NodeRunner,
  node: GraphNode,
  inputs: Record<string, unknown>,
  produced: Record<string, unknown>,
  failures: string[] & { total: number },
): NodeResult {
  const iface = element.outputInterface(node);
  const broken = iface ? mismatches(produced, iface) : [];
  return {
    node_id: node.id, status: failures.length ? 'partial' : 'success', inputs, outputs: produced,
    error: failures.length ? itemFailures(failures) : null,
    ...(broken.length ? { messages: broken.map((line) => `Does not fit its output.js: ${line}`) } : {}),
  };
}

/**
 * What a node that threw comes to. One that catches its own failures turns
 * one into data instead of ending the run: the message goes on its `error`
 * port, its other ports carry null, and whatever that port feeds gets to
 * react -- asked of the element, so one mechanism covers every kind. Still
 * `partial`, never `success`: a node whose outputs are nulls nobody explains
 * is how a broken run comes to look like a clean one.
 */
function failedWith(element: NodeRunner, node: GraphNode, inputs: Record<string, unknown>, error: unknown): NodeResult {
  const message = error instanceof Error ? error.message : String(error);
  if (element.catchesErrors(node)) {
    return { node_id: node.id, status: 'partial', inputs, outputs: failureOutputs(node, message), error: message };
  }
  return { node_id: node.id, status: 'error', inputs, outputs: {}, error: message };
}

/**
 * One node by itself, as `run-node` and the MCP server's `run_node` run it: on
 * the inputs *given*, or -- without them -- on what the nodes feeding it
 * produce, which run for that and nothing else. The graph's questions are
 * answered with what it already holds, as an unattended run answers them.
 * Hands back the inputs it ran on too, since without *given* nobody else knows.
 *
 * What feeds it failing -- or standing still with nothing to hand on, its ◆
 * shut or nothing for it to do -- is this node failing to run, as in a run: it
 * is not run on the nothing that arrived and called a success.
 */
export async function runNodeAlone(
  graph: Graph,
  nodeId: string,
  given: Record<string, unknown> | undefined,
  options: RunOptions,
): Promise<{ inputs: Record<string, unknown>; result: NodeResult }> {
  if (given) return { inputs: given, result: await executeNode(graph, nodeId, given, options) };
  const { inputs, upstream } = await inputsFor(graph, nodeId, options);
  const still = upstream.node_results.find((result) => result.status === 'skipped' && !result.held);
  const stood = still && graph.nodes.find((node) => node.id === still.node_id);
  const why = upstream.node_results.some((result) => result.status === 'error')
    ? `What feeds it failed, so it did not run: ${upstream.error}`
    : stood ? `What feeds it had nothing to hand on, so it did not run: ${nodeName(stood)}: ${still.messages?.[0] ?? 'it stood still.'}` : '';
  if (why) return { inputs, result: { node_id: nodeId, status: 'error', inputs, outputs: {}, error: why } };
  return { inputs, result: await executeNode(graph, nodeId, inputs, options) };
}

/**
 * What the element is given: the wired values, with the file on each input
 * that says "read the file at this path" read into its content.
 *
 * Run once per item, a list it runs over is read an item's file at a time, as
 * many at once as items run at once, and a file that cannot be read costs its
 * item (`readPorts`). Read before any item runs rather than as each does:
 * whether a node run only as context hands back what it made last is decided
 * by what its files say (`reuse.ts`).
 */
async function readInputs(
  element: NodeRunner<unknown>,
  node: GraphNode,
  inputs: Record<string, unknown>,
  runtime: Runtime,
  registry: Runners,
): Promise<Record<string, unknown>> {
  const ports = filePorts(node, registry);
  if (!ports.length) return inputs;
  const each = element.batchMode(node) === 'per_item'
    ? { ports: new Set(node.inputs.filter((port) => port.multi).map((port) => port.id)), atOnce: element.batchConcurrency(node) }
    : undefined;
  try {
    return await readPorts(inputs, ports, runtime.files, each);
  } catch (error) {
    throw unreadable(error);
  }
}

/**
 * A file that could not be read, as the node's failure -- or an item's. The
 * reading is named: a node that never got as far as its own work failed at a
 * missing file, and "ENOENT" on its own reads as though the body went looking
 * for one.
 */
function unreadable(error: unknown): Error {
  return new Error(`Reading its input files: ${error instanceof Error ? error.message : String(error)}`);
}

/** The run's own sentence about what went wrong: which nodes, by name, and why -- and how many of *failed* could not run because of them. */
function failureSummary(results: NodeResult[], byId: Map<string, GraphNode>, failed: Set<string>): string {
  const broken = results.filter((result) => result.status === 'error');
  const skipped = results.filter((result) => result.status === 'skipped' && failed.has(result.node_id)).length;
  const named = broken.map((result) => {
    const node = byId.get(result.node_id);
    const first = (result.error ?? '').split('\n')[0].trim();
    return `${node ? nodeName(node) : `node "${result.node_id}"`} failed${first ? `: ${first}` : ''}`;
  });
  // Nothing errored but something is in `failed`: a node that could not run
  // because what feeds it did not. Naming the count keeps the run from
  // claiming success with no reason given.
  if (!named.length) return `${skipped} node${skipped === 1 ? '' : 's'} could not run.`;
  return named.join('; ') + (skipped ? ` (${skipped} more could not run)` : '');
}

/**
 * What a node that caught its own failure hands on.
 *
 * Null on every declared port so anything downstream sees "nothing arrived"
 * rather than a missing key, and the message on `error` -- the port a person
 * wires when they want to do something about it, and may leave unwired when
 * they only want the run to carry on.
 */
function failureOutputs(node: GraphNode, message: string): Record<string, unknown> {
  const produced: Record<string, unknown> = {};
  for (const port of node.outputs) produced[port.id] = null;
  produced[ERROR_PORT] = message;
  return produced;
}

/** A fan-out that lost some items, in one sentence: how many, and the first reason. */
function itemFailures(failures: string[] & { total: number }): string {
  return `${failures.length} of ${failures.total} items failed: ${failures[0]}`;
}

/**
 * Run one node, fanning out if it asked to.
 *
 * A failing item contributes null on every declared port, keeping the results
 * index-aligned with their inputs, and its message is reported rather than
 * ending the batch: one bad row out of two thousand should cost one row.
 *
 * Except on the `error` port of a node that catches its failures. That port
 * promises the reason, and a list with a null per failed item is no reason --
 * it is a list nobody can read, and a non-empty one, so whatever is wired to
 * the port runs on it. It carries the same sentence the node's result does,
 * once for the node, the way a whole-node failure puts one message there.
 */
async function runNode(
  element: NodeRunner<unknown>,
  node: GraphNode,
  inputs: Record<string, unknown>,
  runtime: Runtime,
  signal?: AbortSignal,
): Promise<{ produced: Record<string, unknown>; failures: string[] & { total: number } }> {
  if (element.batchMode(node) !== 'per_item') {
    const produced = reconcileOutputs(node, await element.execute(node, inputs, runtime));
    return { produced, failures: Object.assign([] as string[], { total: 1 }) };
  }

  const { items, fanned } = batchItems(node, inputs);
  const produced: Record<string, unknown>[] = new Array(items.length);
  const failed: { index: number; message: string }[] = [];
  const catches = element.catchesErrors(node);
  let done = 0;

  await atMost(items.length, element.batchConcurrency(node), async (index) => {
    try {
      const unread = Object.values(items[index]).find((value) => value instanceof Unread);
      if (unread) throw unreadable(unread);
      produced[index] = reconcileOutputs(node, await element.execute(node, items[index], runtime));
    } catch (error) {
      // One bad item must not take the other 499 down with it -- but it is
      // not nothing either: it is counted, and the first is quoted.
      produced[index] = Object.fromEntries(node.outputs
        .filter((p) => !(catches && p.id === ERROR_PORT))
        .map((p) => [p.id, null]));
      const message = error instanceof Error ? error.message : String(error);
      failed.push({ index, message });
      runtime.report?.({ type: 'activity', node_id: node.id, message: `item ${index + 1}: ${message}` });
    }
    runtime.report?.({ type: 'batch', node_id: node.id, done: ++done, total: items.length });
  }, signal);
  // In item order, not the order they happened to fail in: the same run says
  // the same thing every time.
  failed.sort((a, b) => a.index - b.index);
  const failures = Object.assign(failed.map(({ index, message }) => `item ${index + 1}: ${message}`), { total: items.length });
  // Every item failed: that is the node failing, with its own message, not a
  // success made of nulls.
  if (items.length && failed.length === items.length) throw new Error(failed[0].message);
  const merged = mergeBatchOutputs(node, produced, fanned);
  if (catches && failures.length) merged[ERROR_PORT] = itemFailures(failures);
  return { produced: merged, failures };
}

/**
 * What memory nodes keep from this round, settled into the graph the round ran
 * on: what each was handed -- the same as it filled from, a port that takes
 * one value of what arrives (`Port.field`) by that value -- and nothing for one
 * that did not run: a gate that stayed shut, or a writer that failed before it,
 * leaves it as it was. Says which ones took part.
 *
 * That copy is the whole of it: a session keeps it (`backend/gui-editor/session.ts`), and
 * nobody works the same thing out a second time.
 *
 * Per port, as the round delivers: a port fed by several wires keeps the list
 * of what arrived on them, not whichever wire came last.
 */
function settleMemory(
  graph: Graph,
  outputs: Map<string, Record<string, unknown>>,
  results: NodeResult[],
  registry: Runners,
  caught: Set<string>,
): Set<string> {
  const took = new Set(results.filter((r) => (r.status === 'success' || r.status === 'partial') && !r.held).map((r) => r.node_id));
  const settled = new Set<string>();
  for (const target of graph.nodes) {
    const element = registry.node(target.node_type);
    if (!element?.isMemory || !took.has(target.id)) continue;
    settled.add(target.id);
    // What a node that caught its failure put on its ports is "nothing arrived", not a value to keep: a counter would go 6, null, 1.
    const arrived = collectInputs(target.id, graph.edges, outputs, target.inputs,
      (e) => e.source_port_id in (outputs.get(e.source_node_id) ?? {}) && !(caught.has(e.source_node_id) && e.source_port_id !== ERROR_PORT));
    for (const [port, value] of Object.entries(arrived)) if (value !== undefined) element.settleMemory(target, port, value);
  }
  return settled;
}

/**
 * What the run produced, keyed by the graph's end points' labels.
 *
 * Two end points may well be given one label, and a run's result is not a
 * place where one of them may quietly replace the other. The first keeps the
 * label; one that comes later under a label already taken is told apart by its
 * id (`resultKeys`), and `check` says to give it a label of its own.
 *
 * "First" in the graph, whether or not it produced anything this run: a round
 * started by an event, or one where the first stood still, would
 * otherwise hand another's value on under its key -- and whoever lays rounds
 * over each other (a session) would lose one of them once more.
 */
function finalOutputs(
  nodes: GraphNode[],
  outputs: Map<string, Record<string, unknown>>,
  registry: Runners,
): Record<string, unknown> {
  const final: Record<string, unknown> = {};
  for (const [nodeId, key] of resultKeys(nodes, registry)) {
    const produced = outputs.get(nodeId);
    if (produced) final[key] = produced;
  }
  return final;
}
