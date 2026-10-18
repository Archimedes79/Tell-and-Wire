// The room what a node hands on is shown in.
//
// A node wired into an end point hands its result to the block of the GUI that
// shows that point -- a chart, a picture, a table -- and that block has a size.
// ✨ is told it when it writes the node (`editor/graph/writing/generationContext.ts`);
// a body that runs is told it too, as `node.windows`, so code that draws can
// draw for the room there is *now*: a block resized since it was written is
// not a reason to write it again.

import type { Graph, GraphNode } from '../graph/graph.ts';
import type { Kinds } from '../graph/nodes/NodeDefinition.ts';
import type { BlockWindow } from '../graph/nodes/Runtime.ts';
import { guiWidgets, widgetElement } from './gui.ts';
import { blockSize } from './size.ts';

/** The blocks of *graph*'s GUI that show what *node* hands on, by the end points its outputs are wired to. */
export function windowsOf(graph: Graph, node: GraphNode, kinds: Kinds): BlockWindow[] {
  const blocks = guiWidgets(graph);
  if (!blocks.length) return [];
  const found = new Map<string, BlockWindow>();
  for (const edge of graph.edges) {
    if (edge.source_node_id !== node.id || edge.target_port_id === 'path') continue;
    const end = graph.nodes.find((one) => one.id === edge.target_node_id);
    if (!end || !kinds.node(end.node_type)?.isResult) continue;
    for (const block of blocks) {
      if (block.shows !== end.id || !widgetElement(block.kind)?.showsEnd(block)) continue;
      found.set(`${edge.source_port_id}|${block.id}`, {
        port: edge.source_port_id, block: block.id, kind: block.kind, label: block.label, ...blockSize(block),
      });
    }
  }
  return [...found.values()];
}

/** What `windowsOf` says of every node of *graph* that has any, by node id: what a core is told, which is handed no GUI. */
export function windowsByNode(graph: Graph, kinds: Kinds): Record<string, BlockWindow[]> {
  const room: Record<string, BlockWindow[]> = {};
  for (const node of graph.nodes) {
    const found = windowsOf(graph, node, kinds);
    if (found.length) room[node.id] = found;
  }
  return room;
}
