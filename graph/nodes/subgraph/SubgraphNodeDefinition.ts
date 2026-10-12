import { NodeDefinition, type Kinds } from '../NodeDefinition.ts';
import { parseGraph, type Graph, type GraphNode } from '../../graph.ts';
import { errorOutput } from '../../wiring.ts';
import { boundaryPorts } from './boundary.ts';

/**
 * A node that holds a graph.
 *
 * **A subgraph is an ordinary graph**, and almost nothing here exists to make
 * that true -- the same `executeGraph` runs it, the same project folder stores
 * it, the same `check` checks it, the same editor edits it. What is left for
 * this file is one node's own contract: the dictionary at the boundary
 * (`boundary.ts`). What may stand at it is its design's (`problems`), and
 * handing the values across its runner's (`execute`).
 *
 * Three consequences worth stating, because all three are asked about:
 *
 * - A start point inside whose port nothing is wired to is not started from
 *   above: the graph inside runs, and it hands on what its design says it
 *   was sent -- what it is sent when it is run on its own.
 * - The graph inside can be run, checked and deployed on its own -- its folder
 *   is a project folder like any other. A subgraph that only works while
 *   enclosed would be a second kind of graph, and there is only one kind.
 * - Anything short of a clean run in there fails this node. From out here it
 *   is one node, and half of it having worked is not something a port can
 *   carry; the runner's `execute` says why at more length.
 */
export class SubgraphNodeDefinition extends NodeDefinition {
  readonly nodeType = 'subgraph' as const;

  /**
   * A copy, always. The executor may run this node several times at once (a
   * per-item fan-out is one node object and many calls), and a run that
   * settled memory or answered a start point inside a shared graph would be
   * two runs writing over each other -- and would write into what the editor
   * holds and the folder saves, besides.
   */
  override nestedGraph(node: GraphNode): Graph | null {
    const stored = node.config.subgraph;
    // Nothing stored is an empty graph, not "no graph": this node holds one
    // either way, and its folder is where it is kept -- which is how a save
    // knows to write it, and a read knows to look.
    if (stored === undefined || stored === null || stored === '') return parseGraph({ nodes: [], edges: [] });
    return readGraph(stored);
  }

  override setNestedGraph(node: GraphNode, graph: Graph | null): void {
    if (graph) node.config.subgraph = graph;
    else delete node.config.subgraph;
  }

  override derivedPorts(node: GraphNode, kinds: Kinds) {
    const graph = this.nestedGraph(node);
    // Not readable as a graph: no ports rather than an exception. `check` is
    // where an unreadable graph is reported; a node drawn on a canvas is not.
    if (!graph) return { inputs: [], outputs: [] };
    const ports = boundaryPorts(graph, kinds);
    // Run once per item, the ports say so as a code node's do: an input the
    // node declares a list is taken an item at a time, and every output hands
    // on the list of what the runs gave. Which inputs those are is this node's
    // setting, not the graph inside's, so it is kept from what it declares.
    const perItem = this.batchMode(node) === 'per_item';
    const lists = new Set(node.inputs.filter((port) => port.multi).map((port) => port.id));
    const inputs = ports.inputs.map((port) => (perItem && lists.has(port.id) ? { ...port, multi: true } : port));
    const outputs = perItem ? ports.outputs.map((port) => ({ ...port, multi: true })) : ports.outputs;
    return { inputs, outputs: this.catchesErrors(node) ? [...outputs, errorOutput('Set when the graph inside failed')] : outputs };
  }

  /**
   * "Run once per item" runs the graph inside once for each item of a list
   * that arrives -- one run of it is one call, as a code node's `run` is --
   * and the executor fans out and collects, as it does for every kind that
   * says so.
   */
  override readonly fansOut = true;
}

/** The stored graph, or null when there is nothing readable there. */
function readGraph(stored: unknown): Graph | null {
  if (!stored || typeof stored !== 'object') return null;
  try {
    return parseGraph(structuredClone(stored));
  } catch {
    return null;
  }
}
