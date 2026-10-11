// What a graph carries when it leaves the person's project: to a deployed
// tool, to the gui a served tool draws, in a run the editor posts, in an
// answer over MCP, and to a model asked to change the whole graph.
//
// A node keeps some things only for writing it: its history.md -- every
// prompt and reply, with the start of the files ✨ was given -- and the
// files its Input and Output chats were given.
// Nothing a run reads is among them. They stay with the project, where they
// are the node's own record; a package carried up to half a
// megabyte of them per node, to whoever it was handed. What comes back from
// a change of the whole graph takes them from the graph that was sent
// (`generateGraph`), so leaving them out loses none of them.

import type { Graph } from '../graph.ts';
import { registry } from '../nodes/registry.ts';

/** A node's settings that only writing it needs. */
export const WRITING_KEYS = ['history', 'input_files', 'output_files'] as const;

/** A copy of *graph* without what only writing it needs (`WRITING_KEYS`), in the graphs its nodes hold too. */
export function withoutWriting(graph: Graph): Graph {
  const copy = JSON.parse(JSON.stringify(graph)) as Graph;
  for (const node of copy.nodes) {
    const config = node.config as Record<string, unknown>;
    for (const key of WRITING_KEYS) delete config[key];
    const element = registry.node(node.node_type);
    const inside = element?.nestedGraph(node);
    if (inside) element!.setNestedGraph(node, withoutWriting(inside));
  }
  return copy;
}
