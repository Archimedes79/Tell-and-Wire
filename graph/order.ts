// The order a graph runs in.
//
// Kahn's algorithm over the wires gives levels: nothing in a level feeds
// anything else in it. A graph with a loop -- a counter: a data node, and a
// code node adding one to it -- is not a mistake, it is how a tool remembers.
// A wire out of a data node to a node that runs BEFORE it reads what the node
// held when the round began (`readingWires`): that node runs first and fills
// the data node, so what is left of the wires is acyclic. A loop that no data
// node closes is an error, said by name, and how to close it.

import type { GraphEdge, GraphNode } from './graph.ts';
import type { Kinds } from './nodes/NodeDefinition.ts';

/** *from* and every node reached along *edges* -- downstream when *forward*, else upstream. */
export function walk(from: Iterable<string>, edges: GraphEdge[], forward: boolean): Set<string> {
  const seen = new Set(from);
  const queue = [...seen];
  while (queue.length) {
    const id = queue.shift()!;
    for (const edge of edges) {
      const [near, far] = forward
        ? [edge.source_node_id, edge.target_node_id]
        : [edge.target_node_id, edge.source_node_id];
      if (near !== id || seen.has(far)) continue;
      seen.add(far);
      queue.push(far);
    }
  }
  return seen;
}

/**
 * A node the way a person finds it on the canvas.
 *
 * `code node "Chart transform" (transform_1)`, not `transform_1`: the id is
 * what the report needs and the label is what the reader recognises, and a
 * message that carries only one of them sends them looking for the other.
 */
export function nodeName(node: GraphNode): string {
  return `${node.node_type} node ${node.label && node.label !== node.id ? `"${node.label}" (${node.id})` : `"${node.id}"`}`;
}

/** Who runs before whom: the one, then the other. */
export type Pairs = [string, string][];

/**
 * Ids of the wires that read a data node as it was when the round began,
 * rather than as the round fills it: a wire out of a data node to a node that
 * runs before it. A read takes no part in the order the way a wire does -- its
 * reader runs first, and the data node after it, which is how a loop closes --
 * and carries no event: what only reads a memory is not for the event that
 * reaches it.
 *
 * Which runs before which is the schedule's, where there is one (*columns*, the
 * column each node stands in): a wire to a node in an earlier column is a read,
 * one to a node in a later or the same column carries what the data node holds
 * after what arrives has filled it. Without a schedule, or for a node it does
 * not place, the wire that closes a loop is the read: one into a node that the
 * data node is written through. A data node reading itself is a read.
 */
export function readingWires(nodes: GraphNode[], edges: GraphEdge[], registry: Kinds, columns?: ReadonlyMap<string, number>): Set<string> {
  const ids = new Set(nodes.map((node) => node.id));
  const memories = new Set(nodes.filter((node) => registry.node(node.node_type)?.isMemory === true).map((node) => node.id));
  const reads = new Set<string>();
  for (const edge of edges) {
    const { source_node_id: from, target_node_id: to } = edge;
    if (!memories.has(from) || !ids.has(to)) continue;
    const at = columns?.get(from);
    const goes = columns?.get(to);
    if (from === to || (at !== undefined && goes !== undefined ? goes < at : walk([to], edges.filter((other) => other !== edge), true).has(from))) reads.add(edge.id);
  }
  return reads;
}

/**
 * Who runs before whom, a pair for each wire between two nodes: the source,
 * then the target. A read comes the other way round -- its reader runs before
 * the data node is filled, which is why it holds what it held. A node that
 * wires into itself waits for itself, which is a loop; a data node that reads
 * itself waits for nothing.
 */
export function runsBefore(nodes: GraphNode[], edges: GraphEdge[], registry: Kinds, columns?: ReadonlyMap<string, number>): Pairs {
  const ids = new Set(nodes.map((node) => node.id));
  const reads = readingWires(nodes, edges, registry, columns);
  return edges
    .filter((edge) => ids.has(edge.source_node_id) && ids.has(edge.target_node_id) && !(reads.has(edge.id) && edge.source_node_id === edge.target_node_id))
    .map((edge): [string, string] => (reads.has(edge.id) ? [edge.target_node_id, edge.source_node_id] : [edge.source_node_id, edge.target_node_id]));
}

/** *from* and every node that has to come after it, along *pairs*. */
function after(from: Iterable<string>, pairs: Pairs): Set<string> {
  const seen = new Set(from);
  const queue = [...seen];
  while (queue.length) {
    const id = queue.shift()!;
    for (const [one, other] of pairs) {
      if (one !== id || seen.has(other)) continue;
      seen.add(other);
      queue.push(other);
    }
  }
  return seen;
}

/**
 * Kahn's algorithm over *pairs*: the nodes in levels, each level waiting only
 * for earlier ones, and the nodes it could not place, which sit in a loop or
 * below one. The graph's own node order holds inside a level, so a run is
 * reproducible.
 */
function levelsOf(nodes: GraphNode[], pairs: Pairs): { levels: string[][]; stuck: Set<string> } {
  const ids = new Set(nodes.map((n) => n.id));
  const inDegree = new Map([...ids].map((id) => [id, 0]));
  const successors = new Map<string, string[]>();

  for (const [first, then] of pairs) {
    inDegree.set(then, (inDegree.get(then) ?? 0) + 1);
    successors.set(first, [...(successors.get(first) ?? []), then]);
  }

  const levels: string[][] = [];
  const stuck = new Set(ids);
  let current = nodes.filter((n) => inDegree.get(n.id) === 0).map((n) => n.id);
  while (current.length) {
    levels.push(current);
    const next = new Set<string>();
    for (const id of current) {
      stuck.delete(id);
      for (const successor of successors.get(id) ?? []) {
        const left = (inDegree.get(successor) ?? 0) - 1;
        inDegree.set(successor, left);
        if (left === 0) next.add(successor);
      }
    }
    current = nodes.filter((n) => next.has(n.id)).map((n) => n.id);
  }
  return { levels, stuck };
}

/** Of the *stuck* nodes, those the wires go round through, not the ones that merely hang below a loop. */
function inLoop(nodes: GraphNode[], pairs: Pairs, stuck: Set<string>): GraphNode[] {
  return nodes.filter((n) => stuck.has(n.id) && pairs.some(([first, then]) => first === n.id && after([then], pairs).has(n.id)));
}

/** The nodes in a loop that no data node closes: none in a graph that can be ordered. */
export function loopNodes(nodes: GraphNode[], edges: GraphEdge[], registry: Kinds, columns?: ReadonlyMap<string, number>): GraphNode[] {
  const pairs = runsBefore(nodes, edges, registry, columns);
  return inLoop(nodes, pairs, levelsOf(nodes, pairs).stuck);
}

/** Execution stages: everything in a stage waits only for earlier stages. A loop that no data node closes is an error. */
export function topologicalLevels(nodes: GraphNode[], edges: GraphEdge[], registry: Kinds, columns?: ReadonlyMap<string, number>): string[][] {
  const pairs = runsBefore(nodes, edges, registry, columns);
  const { levels, stuck } = levelsOf(nodes, pairs);
  if (stuck.size) {
    const round = inLoop(nodes, pairs, stuck);
    const closed = columns && round.some((one) => registry.node(one.node_type)?.isMemory === true);
    throw new Error(`The wires go round in a cycle through ${round.map(nodeName).join(', ')}, so none of them can run first. `
      + (closed
        ? 'A data node is in it, but the schedule stands the node that reads it after it: put that node in a column before the data node, '
          + 'and the wire back carries what the data node held when the round began.'
        : 'A loop is only allowed through a data node: write the value into one, and wire it back to the node that reads it, '
          + 'which runs before it -- that wire carries what the data node held when the round began.'));
  }
  return levels;
}
