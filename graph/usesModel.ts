// Whether running a graph needs an AI: one node of it asks a model.
//
// Said by the nodes themselves (`NodeDefinition.callsModel`), so no kind is named here -- and the
// delivered tool shows its AI settings only to someone who has any use for them.

import type { Graph } from './graph.ts';
import type { Kinds } from './nodes/NodeDefinition.ts';

/** True when a node of *graph* -- or of a graph inside one -- asks a model when it runs. */
export function graphCallsModel(graph: Graph, kinds: Kinds): boolean {
  return graph.nodes.some((node) => kinds.node(node.node_type)?.callsModel(node, kinds) === true);
}
