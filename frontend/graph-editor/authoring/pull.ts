// Pull, as the editor does it: what feeds each input of a node, and what each
// output of it is written into where that is a memory, read off the graph
// (`graph/authoring/pull.ts` has the files those make).
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
import { memoryReads } from '../../../graph/execution/order.ts';
import { graphEdge } from '../../app/document/wires';
import { RUN_PORT } from '../../../graph/execution/triggers.ts';
import { ERROR_PORT } from '../../../graph/execution/wiring.ts';
import { registry as runnerRegistry } from '../../../graph/nodes/registry.ts';
import { firstPath } from './exampleFile';
import { runsPerItem } from './perItem';
import { textAsRun } from './readAsRun';

/** Whether any input of *node* is wired: there is something to pull. */
export const pullable = (node: GraphNode, edges: Wire[]): boolean =>
  node.inputs.some((port) => edges.some((edge) => edge.target === node.id && edge.targetHandle === port.id));

/** The nodes before *node* that ask a model when they run: a pull runs them, and it is said so. */
export function modelsBefore(node: GraphNode, nodes: GraphNode[], edges: Wire[]): GraphNode[] {
  // A wire that reads a memory round a loop brings what it held, not what runs before.
  const saved = edges.map((edge, at) => graphEdge(edge, at));
  const reads = memoryReads(nodes, saved, runnerRegistry);
  const cut = new Set(edges.filter((_, at) => reads.has(saved[at].id)));
  const seen = new Set([node.id]);
  const asking: GraphNode[] = [];
  for (const queue = [node.id]; queue.length;) {
    const at = queue.shift()!;
    for (const edge of edges) {
      // Checked as each wire is taken: two wires from one node are one node.
      if (edge.target !== at || seen.has(edge.source) || cut.has(edge)) continue;
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
    // What a memory holds, filled (`example.json`): a run only shows how it starts.
    const own = source ? NODE_BUILDERS[source.node_type]?.restingValue(source, out) : undefined;
    const stands = ('example' in stated ? stated.example[out] : undefined) ?? own;
    const reading = reads.has(port.id);
    // A path the node before it states is no example of the text of the file it names.
    let example = reading ? arrived.texts[port.id] : own ?? arrived.inputs[port.id] ?? stands;
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

/**
 * What *node*'s output *port* is written into, where that is a field of a
 * memory node: the field and the example it holds -- what a write to it is
 * shaped as. A memory is the one thing wired after a node that says what it
 * wants exactly, with a value.
 */
function writtenTo(node: GraphNode, port: string, nodes: GraphNode[], edges: Wire[]): { memory: GraphNode; field: string; example: unknown } | undefined {
  for (const edge of edges) {
    if (edge.source !== node.id || (edge.sourceHandle || 'output') !== port || !edge.targetHandle || edge.targetHandle === RUN_PORT) continue;
    const memory = nodes.find((candidate) => candidate.id === edge.target);
    if (memory && runnerRegistry.node(memory.node_type)?.isMemory) {
      return { memory, field: edge.targetHandle, example: NODE_BUILDERS[memory.node_type]?.restingValue(memory, edge.targetHandle) };
    }
  }
  return undefined;
}

/**
 * The outputs of *node* as a pull writes them (`outputFile`), read off the
 * memory each goes into -- or nothing, where one does not go into a memory:
 * what a node hands on to others is for its text and ✨ to say. The type is
 * the field's, and the example the value it holds filled.
 */
export function pulledOutputs(node: GraphNode, nodes: GraphNode[], edges: Wire[]): PulledPort[] | undefined {
  const outputs = node.outputs.filter((port) => port.id !== ERROR_PORT);
  const ports: PulledPort[] = [];
  for (const port of outputs) {
    const into = writtenTo(node, port.id, nodes, edges);
    if (!into) return undefined;
    ports.push({
      id: port.id,
      type: typeOfValue(into.example),
      description: `The new value of "${into.field}" of ${into.memory.label || into.memory.id}`,
      example: into.example,
    });
  }
  return ports.length ? ports : undefined;
}

/** Whether every output of *node* is written into a memory: there is something to pull. */
export const pullableOutput = (node: GraphNode, nodes: GraphNode[], edges: Wire[]): boolean => pulledOutputs(node, nodes, edges) !== undefined;

/**
 * What a pull of *node*'s input could not find, in a sentence that follows
 * "input.js pulled, but": no example from a run, or none for a wired input --
 * or '' where every wired input has one. What is written after it is written
 * against it, and against none is written against nothing.
 */
export function pullGap(node: GraphNode, ports: PulledPort[], edges: Wire[], arrived: Arrived): string {
  if (arrived.error) return `there is no example from a run: ${arrived.error}`;
  const wired = new Set(edges.filter((edge) => edge.target === node.id).map((edge) => edge.targetHandle));
  const bare = ports.filter((port) => port.example === undefined && wired.has(port.id)).map((port) => `"${port.id}"`);
  if (!bare.length) return '';
  const why = arrived.unread.length ? 'the file it reads could not be read' : 'nothing reached it when what feeds it ran';
  return `there is no example for ${bare.join(', ')}: ${why} -- choose a file on the page, or give a start point an example, and pull again.`;
}
