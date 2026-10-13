// What changed in a project folder, as whoever has it open is told.
//
// A leaf on purpose: it imports nothing. The backend writes these in
// `backend/deployment/project/folder.ts`, which reads files; the editor takes
// them in its store, which runs in a browser and must never import a file
// system. Both need the same two words, so the two words live where either
// can reach them.

/** A piece of writing someone changed outside the editor. */
export interface TextChange {
  /** The node it is a node's; null for the graph's own -- its GUI, `field` its blocks. */
  node_id: string | null;
  field: string;
  /** What the file says now; empty when it was deleted. */
  value: unknown;
}

/**
 * The name a change to the graph a node holds is reported under.
 *
 * Not a config field: which field a node keeps its graph in is that element's
 * business (`NodeDefinition.setNestedGraph`), and a change that came from a
 * folder says only "this graph, now".
 */
export const NESTED_GRAPH_FIELD = 'nested_graph';
