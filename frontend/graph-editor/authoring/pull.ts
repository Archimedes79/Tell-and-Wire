// Pull, as the editor does it: what feeds each input of a node, read off the
// graph (`graph/authoring/pull.ts` has the file those make).
//
// For each wired input: the node it comes from says what it hands on -- its
// output.js, the type and what it is -- and a run of what comes before the node
// says what really arrives: the example, one item of it where the node runs per
// item, and the text of the file where the input reads one. Where nothing was
// run, the example in that output.js stands in, or what a node holds -- not for
// an input that reads a file: a path is no example of its text -- and without
// any the input is typed by what it is and has no example.

import type { Graph, GraphNode, Wire } from '../../app/graph';
import { call } from '../../app/api/client';
import { NODE_BUILDERS } from '../../app/elements/registry';
import { definitionExample, definitionsIn, typedefProperties } from '../../../graph/authoring/definition.ts';
import { typeOfValue, type PulledPort } from '../../../graph/authoring/pull.ts';
import { filePorts } from '../../../graph/execution/fileInputs.ts';
import { registry as runnerRegistry } from '../../../graph/nodes/registry.ts';
import { firstPath } from './exampleFile';
import { runsPerItem } from './perItem';
import { textAsRun } from './readAsRun';

/** Whether any input of *node* is wired: there is something to pull. */
export const pullable = (node: GraphNode, edges: Wire[]): boolean =>
  node.inputs.some((port) => edges.some((edge) => edge.target === node.id && edge.targetHandle === port.id));

/** The nodes before *node* that ask a model when they run: a pull runs them, and it is said so. */
export function modelsBefore(node: GraphNode, nodes: GraphNode[], edges: Wire[]): GraphNode[] {
  const seen = new Set([node.id]);
  const asking: GraphNode[] = [];
  for (const queue = [node.id]; queue.length;) {
    const at = queue.shift()!;
    for (const edge of edges) {
      // Checked as each wire is taken: two wires from one node are one node.
      if (edge.target !== at || seen.has(edge.source)) continue;
      seen.add(edge.source);
      const source = nodes.find((candidate) => candidate.id === edge.source);
      if (!source) continue;
      if (runnerRegistry.node(source.node_type)?.asksModel(source as never)) asking.push(source);
      queue.push(source.id);
    }
  }
  return asking;
}

/** What came of running what feeds a node: what arrived at its inputs, the text of the files its inputs read -- and which could not be read -- or why it could not be run. */
export interface Arrived {
  inputs: Record<string, unknown>;
  texts: Record<string, string>;
  /** The inputs whose file could not be read. */
  unread: string[];
  error: string | null;
}

/**
 * What arrives at *node*, from a run of what comes before it on *graph*'s
 * example data -- the node itself is not run -- and the files its inputs read,
 * read as a run reads them. A run that fails, or a file that cannot be read, is
 * not fatal: the pull goes on without it, and says so (`Arrived`).
 */
export async function arrivedAt(node: GraphNode, graph: Graph): Promise<Arrived> {
  const got = await call('nodeInputs', { ...graph, node_id: node.id });
  if (got.error) return { inputs: {}, texts: {}, unread: [], error: got.error };
  const texts: Record<string, string> = {};
  const unread: string[] = [];
  for (const port of filePorts(node, runnerRegistry)) {
    const path = firstPath(got.inputs[port]);
    if (!path) continue;
    try {
      texts[port] = await textAsRun(path);
    } catch {
      unread.push(port);
    }
  }
  return { inputs: got.inputs, texts, unread, error: null };
}

/** The inputs of *node* as a pull writes them (`inputFile`), from what *arrived* of a run before it. */
export function pulledPorts(node: GraphNode, nodes: GraphNode[], edges: Wire[], arrived: Pick<Arrived, 'inputs' | 'texts'>): PulledPort[] {
  const reads = new Set(filePorts(node, runnerRegistry));
  const perItem = runsPerItem(node);
  return node.inputs.map((port) => {
    const wire = edges.find((edge) => edge.target === node.id && edge.targetHandle === port.id);
    const source = wire && nodes.find((candidate) => candidate.id === wire.source);
    const out = wire?.sourceHandle || 'output';
    const said = source ? definitionsIn(source).output : '';
    const property = typedefProperties(said, 'Output').find((one) => one.id === out);
    const stated = definitionExample(said);
    const stands = ('example' in stated ? stated.example[out] : undefined)
      ?? (source ? NODE_BUILDERS[source.node_type]?.restingValue(source, out) : undefined);
    const reading = reads.has(port.id);
    // A path the node before it states is no example of the text of the file it names.
    let example = reading ? arrived.texts[port.id] : arrived.inputs[port.id] ?? stands;
    // A call of a node that runs per item is handed one item of what arrives.
    if (perItem && port.multi && Array.isArray(example)) example = example[0];
    return {
      id: port.id,
      type: reading ? 'string' : property?.type ?? typeOfValue(example),
      description: reading ? 'the content of the file the path names (the input reads it)' : property?.description || port.description?.trim() || '',
      example,
    };
  });
}
