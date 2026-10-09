// What a graph is to the editor, as pure functions: a document read from a
// file, a paste or a model made whole (normalise), laid out for the canvas
// (ReactFlow nodes and edges), folded back into the node that holds it (nested
// graphs), and written as a file keeps it (exported). The store holds the open
// document; these are what it is made with.

import type { Node, Edge } from 'reactflow';
import type { Graph, GraphNode, GraphEdge, GraphMetadata, GuiWidget, NodeType } from '../graph';
import type { TextChange } from '../../../backend/app/api.ts';
import { NESTED_GRAPH_FIELD } from '../../../backend/app/project/changes.ts';
import { defaultMetadata as formatDefaults } from '../../../graph/graph.ts';
import { registry as runnerRegistry } from '../../../graph/nodes/registry.ts';
import { RUN_PORT } from '../../../graph/execution/triggers.ts';
import { derivedNodePorts } from './ports';
import { NODE_KINDS, savedNode } from './nodeKinds';
import { baseNodeConfig } from './baseNodeConfig';
import { graphEdge } from './wires';

/** A node on the canvas: ReactFlow's, carrying the graph node (`store/nodeData.ts`). */
type CanvasNode = Node<{ graphNode: GraphNode }>;

let nodeCounter = 1;
function newId(prefix: string) {
  return `${prefix}-${nodeCounter++}-${Date.now()}`;
}

function normalizeMetadata(metadata: Partial<GraphMetadata> | undefined): GraphMetadata {
  return { ...defaultMetadata(), ...(metadata ?? {}) };
}

function normalizeGraphNode(rawNode: Partial<GraphNode>): GraphNode {
  // No type is a type nobody knows: kept as it came, below, and named by `check`.
  const nodeType = rawNode.node_type ?? ('' as NodeType);
  const nodeId = rawNode.id ?? newId(nodeType || 'node');
  const kind = NODE_KINDS[nodeType];
  // A type this editor does not know -- one of a newer version, say -- is kept
  // as it came, as the backend and a project folder keep it: opening such a
  // graph threw, and a save must not lose the node. `check` names it.
  if (!kind) {
    return {
      label: nodeId, description: '', ...rawNode, id: nodeId, node_type: nodeType,
      position: { x: 0, y: 0, ...(rawNode.position ?? {}) },
      inputs: Array.isArray(rawNode.inputs) ? rawNode.inputs : [],
      outputs: Array.isArray(rawNode.outputs) ? rawNode.outputs : [],
      config: rawNode.config ?? ({} as GraphNode['config']),
    };
  }
  const defaults = kind.create(nodeId);

  const node: GraphNode = {
    ...defaults,
    ...rawNode,
    id: nodeId,
    node_type: nodeType,
    position: {
      ...defaults.position,
      ...(rawNode.position ?? {}),
    },
    inputs: Array.isArray(rawNode.inputs) ? rawNode.inputs : defaults.inputs,
    outputs: Array.isArray(rawNode.outputs) ? rawNode.outputs : defaults.outputs,
    // A key the file left out means what a run reads it as -- its one
    // default -- not what a new node starts with: loading and saving must not
    // change what a graph does.
    config: { ...baseNodeConfig(), ...(rawNode.config ?? {}) },
  };

  // Where the element derives its ports -- a start point, a folder node from
  // its settings, a subgraph node from the graph it holds -- they
  // come from the element, never from what a file, an import or a model said.
  // A run works them out the same way (`portsOf` in `wiring.ts`), and a
  // second answer here is a second answer that can disagree.
  const derived = derivedNodePorts(node);
  return derived ? { ...node, ...derived } : node;
}

/**
 * *outer* with *inner* put back into the node it came out of, and that node's
 * ports derived from it again -- an end point added in there is a port out
 * here, and this is the moment that becomes true.
 */
export function withNested(outer: Graph, nodeId: string, inner: Graph): Graph {
  return {
    ...outer,
    nodes: outer.nodes.map((node) => {
      if (node.id !== nodeId) return node;
      const held = { ...node, config: { ...node.config } };
      runnerRegistry.node(held.node_type)?.setNestedGraph(held as never, inner as never);
      return { ...held, ...(derivedNodePorts(held) ?? {}) };
    }),
  };
}

/**
 * A level of the document as a file keeps it (`exportGraph`): each node's own
 * settings, not every field every node starts with -- and the size it was
 * given, never the one ReactFlow measured: a graph must serialise the same way
 * twice running, or "unsaved" means nothing.
 */
export function exported(rfNodes: CanvasNode[], rfEdges: Edge[], metadata: GraphMetadata, page: GuiWidget[]): Graph {
  const nodes: GraphNode[] = rfNodes.map((rfn) => keptNested(savedNode({
    ...rfn.data.graphNode,
    position: { x: rfn.position.x, y: rfn.position.y },
    // None is no key: a node made here has none, one read back from a file had null.
    width: rfn.data.graphNode.width ?? undefined,
    height: rfn.data.graphNode.height ?? undefined,
  })));
  const edges: GraphEdge[] = rfEdges.map(graphEdge);
  return { metadata, nodes, edges, ...(page.length ? { page: { blocks: page } } : {}) };
}

/**
 * *node* with the graph it holds -- a subgraph's -- kept as that graph is kept
 * from inside it: going in and out again, changing nothing, read as unsaved
 * when the file wrote a node's default (`batch_mode: "whole_list"`) that a
 * level leaves out.
 */
function keptNested(node: GraphNode): GraphNode {
  const element = runnerRegistry.node(node.node_type);
  const held = element?.nestedGraph(node as never) as Graph | null | undefined;
  if (!element || !held) return node;
  const graph = normalizeGraph(held);
  const { rfNodes, rfEdges } = buildReactFlowGraph(graph);
  const kept = { ...node, config: { ...node.config } };
  element.setNestedGraph(kept as never, exported(rfNodes, rfEdges, graph.metadata, graph.page?.blocks ?? []) as never);
  return kept;
}

/** The page's blocks as a change of page.json says them. */
export const pageOf = (change: TextChange): GuiWidget[] => (Array.isArray(change.value) ? change.value : []) as GuiWidget[];

/** *change* taken into *node*: a file of it as it is on disk, or the graph it holds; its ports follow. */
export function takeIn(node: GraphNode, change: TextChange): void {
  // Where a node keeps the graph it holds is the element's business.
  if (change.field === NESTED_GRAPH_FIELD) runnerRegistry.node(node.node_type)?.setNestedGraph(node as never, change.value as never);
  else (node.config as unknown as Record<string, unknown>)[change.field] = change.value;
  Object.assign(node, derivedNodePorts(node) ?? {});
}

/**
 * Whether *edge* is a wire of one of the nodes *touched* to a port its node has
 * not: a field a file on disk left out is a port gone, and a wire left on it
 * is one nobody can see to delete.
 */
export function lostWire(nodes: GraphNode[], edge: GraphEdge, touched: Set<string>): boolean {
  const lacks = (id: string, port: string, side: 'inputs' | 'outputs') =>
    touched.has(id) && port !== RUN_PORT && !nodes.find((node) => node.id === id)?.[side].some((one) => one.id === port);
  return lacks(edge.source_node_id, edge.source_port_id, 'outputs') || lacks(edge.target_node_id, edge.target_port_id, 'inputs');
}

/** The undo state *snapshot* with what came in from disk (*changes*) in it, as it is kept (`exported`). */
export function withDiskChanges(snapshot: string, changes: TextChange[]): string {
  const graph = normalizeGraph(JSON.parse(snapshot) as Graph);
  let blocks = graph.page?.blocks ?? [];
  for (const change of changes) {
    if (change.node_id === null) blocks = pageOf(change);
    else {
      const node = graph.nodes.find((candidate) => candidate.id === change.node_id);
      if (node) takeIn(node, change);
    }
  }
  const touched = new Set(changes.flatMap((change) => change.node_id ?? []));
  graph.edges = graph.edges.filter((edge) => !lostWire(graph.nodes, edge, touched));
  const { rfNodes, rfEdges } = buildReactFlowGraph(graph);
  return JSON.stringify(exported(rfNodes, rfEdges, graph.metadata, blocks));
}

export function normalizeGraph(graph: Graph): Graph {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes.map((node) => normalizeGraphNode(node)) : [];
  const nodeIds = new Set(nodes.map((node) => node.id));
  // A wire is taken as the graph says it (`GraphEdge`); one to a node that is
  // not there is dropped, as `check` would report it.
  const edges = Array.isArray(graph.edges)
    ? graph.edges.filter((edge) => nodeIds.has(edge.source_node_id) && nodeIds.has(edge.target_node_id))
    : [];

  // A page is its blocks: one with none is no page.
  const blocks = Array.isArray(graph.page?.blocks) ? graph.page.blocks : [];
  return {
    metadata: normalizeMetadata(graph.metadata),
    nodes,
    edges,
    ...(blocks.length ? { page: { blocks } } : {}),
  };
}

/** The format's defaults (`defaultMetadata` in `graph/graph.ts`), in the editor's typed view of them. */
export const defaultMetadata = (): GraphMetadata => formatDefaults() as GraphMetadata;

/** The size a file gave a node, if it gave one, as ReactFlow lays it out: nothing in the editor resizes a node. */
function sizeStyle(node: GraphNode): { style: { width: number; height: number } } | Record<string, never> {
  return typeof node.width === 'number' && typeof node.height === 'number'
    ? { style: { width: node.width, height: node.height } }
    : {};
}

/**
 * Build the ReactFlow node/edge arrays for a graph. Shared by `loadGraph` and by
 * undo/redo's `applyGraphSnapshot`, so restoring a snapshot can never drift from
 * loading a file -- they were the same twenty lines twice.
 */
export function buildReactFlowGraph(graph: Graph) {
  const rfNodes: CanvasNode[] = graph.nodes.map((gn) => ({
    id: gn.id,
    type: 'graphNode',
    position: { x: gn.position.x, y: gn.position.y },
    // A size goes in `style`, which is what ReactFlow *renders* from.
    // `width`/`height` on a node are its measurement: ReactFlow fills them in once the node is drawn and
    // overwrites whatever was put there. Setting the size there therefore did
    // nothing at all -- a node saved at 340x300 came back at whatever its
    // contents happened to measure -- and the measurement then read as an edit
    // to a graph nobody had touched.
    ...sizeStyle(gn),
    data: { graphNode: gn },
  }));

  // How a wire looks is the canvas's to say (`canvas/wireLook.ts`): it depends
  // on what is selected there, which the document knows nothing of.
  const rfEdges: Edge[] = graph.edges.map((ge) => ({
    id: ge.id,
    source: ge.source_node_id,
    sourceHandle: ge.source_port_id,
    target: ge.target_node_id,
    targetHandle: ge.target_port_id,
  }));

  return { rfNodes, rfEdges };
}
