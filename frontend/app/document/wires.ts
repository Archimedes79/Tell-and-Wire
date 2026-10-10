// A wire as the canvas holds it, turned into the edge a graph file saves --
// and what wiring does to the ports it joins, a port renamed or gone.

import type { Edge, Node } from 'reactflow';
import type { GraphEdge, GraphNode, GuiWidget, Wire } from '../graph';
import { wireOf } from '../../../backend/app/project/flow.ts';
import { RUN_PORT } from '../../../graph/execution/triggers.ts';
import { registry as runnerRegistry } from '../../../graph/nodes/registry.ts';
import { derivedNodePorts } from './ports';
import { defaultField, takenAs } from './page';
import { NODE_KINDS } from './nodeKinds';

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

/** A node on the canvas, as far as a wire is concerned. */
type CanvasNode = Node<{ graphNode: GraphNode }>;

/** Whether a wire dropped on *node* becomes a new input of it: a code or AI node, whose inputs are its own to name. */
export function takesNewInputs(node: GraphNode): boolean {
  return derivedNodePorts(node) === null && runnerRegistry.node(node.node_type)?.readsFileInputs === true;
}

/**
 * The id of *node*'s one input where it is still the input its kind made it
 * with and nothing uses it: no wire into it (*wired*), and nothing written
 * that reads it -- an input definition, a body. A wire dropped on the node
 * takes its place: kept, it stood empty -- "prompt" beside the input the
 * wire made, "needed" by nothing and fed by nothing.
 */
export function untouchedInput(node: GraphNode, wired: boolean): string | undefined {
  const [only, ...more] = node.inputs;
  const [made, ...madeMore] = NODE_KINDS[node.node_type]?.create(node.id).inputs ?? [];
  if (!only || more.length || wired || !made || madeMore.length) return undefined;
  if (only.id !== made.id || only.name !== made.name || only.data_type !== made.data_type || only.multi !== made.multi || only.field) return undefined;
  const element = runnerRegistry.node(node.node_type);
  const body = element?.generation()?.fields.body;
  const written = !!element?.definitions(node as never)?.input.trim() || (!!body && !!String(node.config[body as keyof typeof node.config] ?? '').trim());
  return written ? undefined : only.id;
}

/**
 * What a new wire does to the ports it joins, on the draft *nodes* of the store:
 * the policy for how a port is typed by what is wired to it.
 */
export function retypeJoined(
  nodes: CanvasNode[], page: GuiWidget[], wire: { source: string; sourceHandle: string; target: string; targetHandle: string },
): void {
  const nodeOf = (id: string) => nodes.find((node) => node.id === id)?.data.graphNode;
  const portOf = (id: string, side: 'inputs' | 'outputs', portId: string) => nodeOf(id)?.[side].find((port) => port.id === portId);
  const from = portOf(wire.source, 'outputs', wire.sourceHandle);
  const to = portOf(wire.target, 'inputs', wire.targetHandle);
  const source = nodeOf(wire.source);
  const into = nodeOf(wire.target);
  const own = !!into && derivedNodePorts(into) === null;
  // From a start point the page sends one block to: the input takes
  // what that block sends, typed as it says -- a text, a folder's files
  // -- rather than the whole package; from one a call starts, the part of
  // its example the input is named after, or its one part. A port that
  // follows from its node's settings takes the part and keeps its type.
  // Its ports can say otherwise.
  const sent = source && to && runnerRegistry.node(source.node_type)?.takesPackage ? defaultField(page, source, to) : undefined;
  if (sent && to && !to.field) Object.assign(to, takenAs(to, sent.choice, own));
  // A wire from a port that carries file paths -- a picker, a folder --
  // ticks "Read the file at this path" on the input it ends on: the port is
  // typed `file_path`, and a code or AI node is handed the file's text there.
  // Its ports can untick it; this is so that nobody has to say it, because
  // the wire already did. Only on a node that reads its files
  // (`readsFileInputs`), not on one whose ports follow from its settings, and
  // only a port with nobody's word on it: a port typed `text` said what it
  // wants, and a run reads it the same way (`execution/fileInputs.ts`).
  const reads = !!into && runnerRegistry.node(into.node_type)?.readsFileInputs === true && derivedNodePorts(into) === null;
  if (reads && from?.data_type === 'file_path' && to && to.data_type === 'any') {
    to.data_type = 'file_path';
    if (from.multi) to.multi = true;
  }
  // A list wired into what an end point hands back is a list it hands
  // back: so the graph's interface says, and a block that shows it.
  const result = !!into && runnerRegistry.node(into.node_type)?.isResult === true
    && runnerRegistry.node(into.node_type)!.valuePorts(into as never).some((port) => port.id === to?.id);
  if (result && from?.multi && to) to.multi = true;
}

/** Where each port of a node went: renamed to an id, or null for removed; per side (`portRenames`). */
interface Renames {
  inputs: Record<string, string | null>;
  outputs: Record<string, string | null>;
}

/**
 * The draft *edges* after node *nodeId*'s ports changed: a renamed port keeps
 * its wires, a removed one loses them by name (`pruneDangling` cannot tell it
 * from a new port given the same name), and a wire is named after its ends
 * again, as `connect` names one.
 */
export function followRenames(edges: Edge[], nodeId: string, renamed: Renames): Edge[] {
  const fate = (map: Record<string, string | null>, handle: string | null | undefined) =>
    (handle && Object.prototype.hasOwnProperty.call(map, handle) ? map[handle] : undefined);
  const cut = new Set<Edge>();
  for (const edge of edges) {
    const into = edge.target === nodeId ? fate(renamed.inputs, edge.targetHandle) : undefined;
    const from = edge.source === nodeId ? fate(renamed.outputs, edge.sourceHandle) : undefined;
    if (into === null || from === null) { cut.add(edge); continue; }
    if (into) edge.targetHandle = into;
    if (from) edge.sourceHandle = from;
    if (into || from) edge.id = wireOf(graphEdge(edge));
  }
  return cut.size ? edges.filter((edge) => !cut.has(edge)) : edges;
}

/** *edges* without those that dangle off a port *node* no longer has (an output.js that names fewer). */
export function pruneDangling(edges: Edge[], node: GraphNode): Edge[] {
  const inputIds = new Set(node.inputs.map((port) => port.id));
  const outputIds = new Set(node.outputs.map((port) => port.id));
  return edges.filter((edge) => {
    // The run port is every node's and nobody's: it is never in the list.
    if (edge.target === node.id && edge.targetHandle && edge.targetHandle !== RUN_PORT && !inputIds.has(edge.targetHandle)) return false;
    if (edge.source === node.id && edge.sourceHandle && !outputIds.has(edge.sourceHandle)) return false;
    return true;
  });
}
