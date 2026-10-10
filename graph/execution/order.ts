// The order a graph runs in.
//
// Kahn's algorithm over the wires gives levels: nothing in a level feeds
// anything else in it. A graph with a loop -- a counter: a data node, and a
// code node adding one to it -- is not a mistake, it is how a tool remembers:
// the node that reads the memory takes its passive output, the wire from which
// is left out of the order (`passiveWires`), so what remains is acyclic. A
// loop without one is an error, said by name, and how to close it.

import type { GraphEdge, GraphNode } from '../graph.ts';
import type { Runners } from '../nodes/NodeRunner.ts';

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

/**
 * Kahn's algorithm over *edges* but those in *skip*: the nodes in levels, each
 * level waiting only for earlier ones, and the nodes it could not place, which
 * sit in a loop or below one. The graph's own node order holds inside a level,
 * so a run is reproducible.
 */
function levelsOf(nodes: GraphNode[], edges: GraphEdge[], skip: Set<string>): { levels: string[][]; stuck: Set<string> } {
  const ids = new Set(nodes.map((n) => n.id));
  const inDegree = new Map([...ids].map((id) => [id, 0]));
  const successors = new Map<string, string[]>();

  for (const e of edges) {
    if (skip.has(e.id) || !ids.has(e.source_node_id) || !ids.has(e.target_node_id)) continue;
    inDegree.set(e.target_node_id, (inDegree.get(e.target_node_id) ?? 0) + 1);
    successors.set(e.source_node_id, [...(successors.get(e.source_node_id) ?? []), e.target_node_id]);
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

/**
 * Ids of the wires that come from a passive output (`Port.passive`): they
 * take no part in the order, and carry what the node held when the round
 * began. That is how a loop through a memory is closed -- the node that reads
 * it takes its `before` -- while the wires into the memory are in the order
 * like any other, so it fills, and then forwards what it holds.
 */
export function passiveWires(nodes: GraphNode[], edges: GraphEdge[], registry: Runners): Set<string> {
  const passive = new Map<string, Set<string>>();
  for (const node of nodes) {
    const outputs = registry.node(node.node_type)?.derivedPorts(node, registry)?.outputs ?? node.outputs;
    const ids = outputs.filter((port) => port.passive).map((port) => port.id);
    if (ids.length) passive.set(node.id, new Set(ids));
  }
  return new Set(edges.filter((e) => passive.get(e.source_node_id)?.has(e.source_port_id)).map((e) => e.id));
}

/** Execution stages: everything in a stage waits only for earlier stages. A loop that no memory closes is an error. */
export function topologicalLevels(nodes: GraphNode[], edges: GraphEdge[], registry: Runners): string[][] {
  const reads = passiveWires(nodes, edges, registry);
  const { levels, stuck } = levelsOf(nodes, edges, reads);
  if (stuck.size) {
    // The nodes the wires go round through, not the ones that merely hang below.
    const live = edges.filter((e) => !reads.has(e.id));
    const round = nodes.filter((n) => stuck.has(n.id) && live.some((e) => e.source_node_id === n.id && walk([e.target_node_id], live, true).has(n.id)));
    const memory = round.find((n) => registry.node(n.node_type)?.isMemory);
    throw new Error(`The wires go round in a cycle through ${round.map(nodeName).join(', ')}, so none of them can run first. `
      + (memory
        ? `The node that reads ${nodeName(memory)} in the loop must take its "before" output, which waits for nothing.`
        : 'A loop is only allowed through a data node: write the value into one, and read it back from its "before" output.'));
  }
  return levels;
}
