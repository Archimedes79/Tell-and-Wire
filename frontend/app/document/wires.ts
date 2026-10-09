// A wire as the canvas holds it, turned into the edge a graph file saves.

import type { GraphEdge, Wire } from '../graph';

/**
 * *wire* as a saved `GraphEdge`: the ends named for the file. A handle the
 * canvas left out is the port a node has when it has one -- `output` and
 * `input`, as a saved graph has always read it -- so what the authoring rules
 * ask of the wiring is what a run, reading the saved file, will find. A wire
 * without an id is given one by its place, *at*.
 *
 * Written once, here, so every place a wire becomes a saved edge -- exporting
 * the graph, naming a new wire, the graph sweep -- agrees on a missing handle.
 */
export function graphEdge(wire: Wire & { id?: string }, at = 0): GraphEdge {
  return {
    id: wire.id || `e${at}`,
    source_node_id: wire.source,
    source_port_id: wire.sourceHandle || 'output',
    target_node_id: wire.target,
    target_port_id: wire.targetHandle || 'input',
  };
}

/**
 * The node a wire brings into *id* and the one it leads to -- the first of each,
 * in the order the wires were drawn: where the node view's ‹ and › step to.
 */
export function neighbours(id: string, wires: Pick<Wire, 'source' | 'target'>[]): { before?: string; after?: string } {
  return {
    before: wires.find((wire) => wire.target === id && wire.source !== id)?.source,
    after: wires.find((wire) => wire.source === id && wire.target !== id)?.target,
  };
}
