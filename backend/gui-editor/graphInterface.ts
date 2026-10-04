// What a graph offers whoever uses it from outside, under names.
//
// A page, a script, a model over MCP, a frontend somebody wrote: each starts a
// round with an event and values, and reads back what it produced -- by name,
// never by node or port. There is one kind of way in, a start point, and one
// of way out, an end point, each by its own id (`NodeRunner.offers`). What a
// round is sent goes into the start point it fires, as one package; nothing
// else of the graph is set from outside. The page's blocks are not among the
// names: they connect themselves to them (`elements/page.ts`). A graph inside
// a node meets the graph above it the same way (`subgraph/boundary.ts`).
//
// Not to be mistaken for `interface.ts`, which is the shape of what one node
// hands on. This is the graph's own: what goes into all of it, and what comes
// out.

import type { DataType, ExecutionResult, Graph, GraphNode } from '../../graph/graph.ts';
import type { Offer, Runners, StartedBy } from '../../graph/nodes/NodeRunner.ts';
import type { Trigger } from '../../graph/execution/triggers.ts';
import { names } from '../../graph/execution/wiring.ts';
import { firedBy, sentBy, widgetElement } from './widgets/page.ts';

type OfferKind = Offer['kind'];

/** One name, as a caller is told it: no node, no port. */
export interface InterfaceEntry {
  name: string;
  label: string;
  type: DataType;
  list?: boolean;
  description?: string;
  /** An event's: who starts it -- the page, a call, the graph itself. */
  started_by?: StartedBy;
  /** A start point's: the blocks of the page whose event fires it, by id. */
  fired_by?: string[];
  /** A start point's: what the page sends with it -- each block whose data goes to it, by the block's id -- as the package's values. */
  sends?: InterfaceEntry[];
  /**
   * A start point's: what the graph reads of the values it is sent -- each
   * part a node wired to it takes (`Port.field`), `file.content` for one
   * inside another, typed as that node takes it. What a caller sends for it
   * to be used; anything else it sends is there for a node that takes all of it.
   */
  reads?: InterfaceEntry[];
}

/** What a graph offers: what starts a round, and what it hands back. */
export interface GraphInterface {
  events: InterfaceEntry[];
  outputs: InterfaceEntry[];
}

/** A name the graph does not offer, asked for by a caller: the caller's mistake, said as one. */
export class NotOffered extends Error {}

interface Offered {
  node: GraphNode;
  offer: Offer;
}

/** Every offer of *graph*, by kind and name: a node's id, which no other node has (`wiring.ts` refuses a second). */
function offered(graph: Graph, registry: Runners): Record<OfferKind, Map<string, Offered>> {
  const found: Record<OfferKind, Map<string, Offered>> = { event: new Map(), output: new Map() };
  for (const node of graph.nodes) {
    for (const offer of registry.node(node.node_type)?.offers(node) ?? []) {
      if (!found[offer.kind].has(offer.name)) found[offer.kind].set(offer.name, { node, offer });
    }
  }
  return found;
}

const entry = ({ name, label, type, list, description, startedBy }: Offer): InterfaceEntry => ({
  name, label, type, ...(list ? { list } : {}), ...(description ? { description } : {}), ...(startedBy ? { started_by: startedBy } : {}),
});

/** What the page sends with start point *name*, as a caller is told it: each block's data, by the block's id. */
function pageSent(graph: Graph, name: string): InterfaceEntry[] {
  return sentBy(graph, name).map((widget) => {
    const sent = widgetElement(widget.kind)!.sends(widget)!;
    return { name: widget.id, label: widget.label || widget.id, type: sent.type, ...(sent.list ? { list: true } : {}), description: sent.description };
  });
}

/**
 * What the graph reads of what start point *start* is sent on *port*: each
 * part an input wired from it takes, once, as the first input to take it is
 * typed.
 */
function readOf(graph: Graph, start: GraphNode, port: string | undefined): InterfaceEntry[] {
  const reads = new Map<string, InterfaceEntry>();
  for (const edge of graph.edges) {
    if (edge.source_node_id !== start.id || edge.source_port_id !== port) continue;
    const input = graph.nodes.find((node) => node.id === edge.target_node_id)?.inputs.find((one) => one.id === edge.target_port_id);
    if (!input?.field || reads.has(input.field)) continue;
    reads.set(input.field, {
      name: input.field, label: input.name || input.id, type: input.data_type,
      ...(input.multi ? { list: true } : {}), ...(input.description ? { description: input.description } : {}),
    });
  }
  return [...reads.values()];
}

/**
 * What *graph* offers, as a caller is told it: each start point with what
 * the graph reads of what it is sent -- and, for one the page starts, which
 * blocks fire it and what the page sends with it, so a script that starts it
 * in the page's place knows what to send -- and each end point.
 */
export function interfaceOf(graph: Graph, registry: Runners): GraphInterface {
  const found = offered(graph, registry);
  const events = [...found.event.values()].map(({ node, offer }) => {
    const said = entry(offer);
    const fired = firedBy(graph, offer.name).map((widget) => widget.id);
    const sends = pageSent(graph, offer.name);
    const reads = readOf(graph, node, offer.port);
    return { ...said, ...(fired.length ? { fired_by: fired } : {}), ...(sends.length ? { sends } : {}), ...(reads.length ? { reads } : {}) };
  });
  return { events, outputs: [...found.output.values()].map(({ offer }) => entry(offer)) };
}

/** The round the event *name* starts, as the executor is handed it -- none, for the whole graph. */
export function eventOf(graph: Graph, name: string | null | undefined, registry: Runners): Trigger | null {
  if (!name) return null;
  const events = offered(graph, registry).event;
  const found = events.get(name);
  if (!found) throw new NotOffered(`No event called "${name}": this graph starts on ${names(events.keys())}.`);
  return { node_id: found.node.id, port_id: found.offer.port ?? null };
}

/** The start point *trigger* fires, when it fires one: the node that takes what the round was sent as one package. */
function packageTaker(graph: Graph, trigger: Trigger | null, registry: Runners): GraphNode | null {
  const node = trigger ? graph.nodes.find((one) => one.id === trigger.node_id) : undefined;
  return node && registry.node(node.node_type)?.takesPackage ? node : null;
}

/**
 * Refuse what a round for *trigger* was sent before anything is written:
 * values for a round of the whole graph, which no start point takes -- the
 * one way into a graph. A start point takes what it is sent under whatever
 * names the sender gave it -- its first node reads them -- and refuses nothing.
 */
export function checkSent(graph: Graph, trigger: Trigger | null, values: Record<string, unknown>, registry: Runners): void {
  if (packageTaker(graph, trigger, registry) || !Object.keys(values).length) return;
  const starts = [...offered(graph, registry).event.keys()];
  throw new NotOffered(starts.length
    ? `A round of the whole graph is sent nothing: send ${names(Object.keys(values))} with an event -- this graph starts on ${names(starts)}.`
    : `This graph is sent nothing: it has no start point, so nothing from outside reaches it. It was sent ${names(Object.keys(values))}.`);
}

/** Put what a round for *trigger* was sent into the start point it fires, as its package: *by* says who sent it. */
export function applySent(graph: Graph, trigger: Trigger | null, values: Record<string, unknown>, by: string, registry: Runners): void {
  const start = packageTaker(graph, trigger, registry);
  if (start) registry.node(start.node_type)!.startWith(start, { by, values });
}

/**
 * A round started from outside -- the command line, a model over MCP: the
 * event *name*, or the whole graph for none, sent *values* as a call sends
 * them. Refused (`NotOffered`) before anything is written. Returns the event
 * to run; a round of the whole graph still starts the page's start points
 * when it runs (`startFromPage`).
 */
export function sendFromOutside(graph: Graph, name: string | null | undefined, values: Record<string, unknown>, registry: Runners): Trigger | null {
  const trigger = eventOf(graph, name, registry);
  checkSent(graph, trigger, values, registry);
  applySent(graph, trigger, values, 'call', registry);
  return trigger;
}

/** What each start point of *graph* was sent last, by its name: the values of the last round it began, else its design's. */
export function sentOf(graph: Graph, registry: Runners): Record<string, unknown> {
  return Object.fromEntries([...offered(graph, registry).event].map(([name, { node }]) => (
    [name, registry.node(node.node_type)?.lastSent(node) ?? null]
  )));
}

/** What *result* hands back, by name: each output whose node is in it. */
export function outputsOf(graph: Graph, result: ExecutionResult | null, registry: Runners): Record<string, unknown> {
  const outputs: Record<string, unknown> = {};
  if (!result) return outputs;
  const ran = new Map(result.node_results.map((one) => [one.node_id, one]));
  for (const [name, { node }] of offered(graph, registry).output) {
    const own = ran.get(node.id);
    const shown = own ? registry.node(node.node_type)?.shows(node, own) : undefined;
    if (shown !== undefined) outputs[name] = shown;
  }
  return outputs;
}
