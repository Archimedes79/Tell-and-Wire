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
 * The nodes wires bring into *id* and the ones they lead to, each once, in the
 * order the wires were drawn: where the node view's ‹ and › step to.
 */
export function neighbours(id: string, wires: Pick<Wire, 'source' | 'target'>[]): { before: string[]; after: string[] } {
  const ends = (from: 'source' | 'target', to: 'source' | 'target') =>
    [...new Set(wires.filter((wire) => wire[to] === id && wire[from] !== id).map((wire) => wire[from]))];
  return { before: ends('source', 'target'), after: ends('target', 'source') };
}
