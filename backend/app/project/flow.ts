// `flow.json`: the graph's name and every wire -- nothing about any node.
//
//     {
//       "name": "Population plotter",
//       "wires": [
//         "pick.data -> chart.request",
//         "chart.figure -> plot.value"
//       ]
//     }
//
// The one file that says how a graph runs, read in one glance. What a node is
// -- its kind, heading, text, settings and ports -- is `nodes.json`'s, and a
// graph is put together here from the two. No file system: `folder.ts` reads
// the files, and so can a test or a page that already has their contents.

import { defaultMetadata, parseGraph, type Graph, type GraphEdge, type GraphMetadata } from '../../../graph/graph.ts';
import { NotAGraph } from '../../../graph/errors.ts';
import type { Problem } from '../../../graph/execution/wiring.ts';
import { nodesFrom, sorted } from './nodesFile.ts';
import { folderName } from './names.ts';

export const FLOW_FILE = 'flow.json';

/** A wire, as the flow writes it: `from.port -> to.port`. It is also the edge's id. */
export function wireOf(edge: GraphEdge): string {
  return `${edge.source_node_id}.${edge.source_port_id} -> ${edge.target_node_id}.${edge.target_port_id}`;
}

function edgeOf(wire: unknown, path: string): GraphEdge {
  const text = String(wire);
  const sides = text.split('->').map((side) => side.trim());
  const end = (side: string | undefined): [string, string] | null => {
    const dot = side ? side.indexOf('.') : -1;
    return side && dot > 0 && dot < side.length - 1 ? [side.slice(0, dot), side.slice(dot + 1)] : null;
  };
  const from = end(sides[0]);
  const to = end(sides[1]);
  if (sides.length !== 2 || !from || !to) {
    throw new NotAGraph(`${path}: "${text}" is not a wire. Write it as "node.port -> node.port".`);
  }
  const edge = { id: '', source_node_id: from[0], source_port_id: from[1], target_node_id: to[0], target_port_id: to[1] };
  return { ...edge, id: wireOf(edge) };
}

/** The graph's settings, with every one still at its default left out: the flow says what is particular. */
function particular(metadata: GraphMetadata): Record<string, unknown> {
  const plain = defaultMetadata() as unknown as Record<string, unknown>;
  const given = metadata as unknown as Record<string, unknown>;
  const { name, description, ...rest } = given;
  const differs = (key: string): boolean => JSON.stringify(given[key]) !== JSON.stringify(plain[key]);
  return {
    name,
    ...(description ? { description } : {}),
    ...sorted(Object.fromEntries(Object.keys(rest).filter(differs).map((key) => [key, rest[key]]))),
  };
}

/** Why *name* cannot end a wire in `flow.json`, or '' when it can. */
function unwritable(name: string): string {
  if (!name.trim()) return 'is empty';
  if (name !== name.trim()) return 'starts or ends with a space';
  if (name.includes('->')) return 'has "->" in it, which is what a wire is written with';
  return '';
}

/**
 * Ids a project folder could write and not read back the same: said by
 * `check`, and refused by a save before anything is written.
 *
 * A node's id is a key of `nodes.json` and the start of each wire, and names
 * its folder. So it may hold no "." (the wire could not say where
 * the port begins), is not a number (a JSON object lists those first, and the
 * graph would come back in another order), and two ids may not name one
 * folder on a disk that does not tell "Count" from "count".
 */
export function unsavableIds(graph: Graph): Problem[] {
  const problems: Problem[] = [];
  const folders = new Map<string, string>();
  for (const node of graph.nodes) {
    const where = `node "${node.id}"`;
    const why = unwritable(node.id)
      || (node.id.includes('.') ? 'has a "." in it, so a wire could not say where the node ends and its port begins' : '')
      || (/^\d+$/.test(node.id) ? 'is a number, which nodes.json would list before every other node' : '');
    if (why) problems.push({ where, problem: `Its id ${why}.`, fix: 'Rename it, for example with letters, digits and "_".' });
    const folder = folderName(node.id).toLowerCase();
    const other = folders.get(folder);
    if (other !== undefined && other !== node.id) {
      problems.push({ where, problem: `It would share a folder on disk with node "${other}": their ids differ only in case or punctuation.`, fix: 'Rename one of them.' });
    }
    folders.set(folder, node.id);
  }
  for (const edge of graph.edges) {
    for (const portId of new Set([edge.source_port_id, edge.target_port_id])) {
      const why = unwritable(portId);
      if (why) problems.push({ where: `edge "${edge.id}"`, problem: `Its port "${portId}" ${why}, so flow.json could not read the wire back.`, fix: 'Rename the port.' });
    }
  }
  return problems;
}

/** What `flow.json` says for *graph*. */
export function flowOf(graph: Graph): Record<string, unknown> {
  const [unsavable] = unsavableIds(graph);
  if (unsavable) throw new NotAGraph(`${unsavable.where}: ${unsavable.problem} ${unsavable.fix}`);
  return {
    ...particular(graph.metadata),
    wires: graph.edges.map(wireOf),
  };
}

/**
 * The graph a flow and a list of nodes describe -- without the writing (code,
 * prompts), which is in files of its own and read in afterwards.
 *
 * *flowPath* and *nodesPath* name the files in a message about what is wrong
 * with them.
 */
export function graphFrom(flow: unknown, list: unknown, flowPath: string, nodesPath: string): Graph {
  if (!flow || typeof flow !== 'object' || Array.isArray(flow)) throw new NotAGraph(`${flowPath} is not a flow: expected an object with "name" and "wires".`);
  const { wires = [], ...metadata } = flow as Record<string, unknown>;
  if (!Array.isArray(wires)) throw new NotAGraph(`${flowPath}: "wires" must be a list, one "node.port -> node.port" each.`);
  const nodes = nodesFrom(list, nodesPath);

  try {
    return parseGraph({ metadata, nodes, edges: wires.map((wire) => edgeOf(wire, flowPath)) });
  } catch (error) {
    if (error instanceof NotAGraph) throw error;
    throw new NotAGraph(`${flowPath} is not a graph: ${(error as Error).message}`);
  }
}
