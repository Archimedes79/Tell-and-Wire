// Adding, wiring, changing and deleting nodes: the store's editing actions.

import type { Edge, Node } from 'reactflow';
import type { GraphNode, GuiWidget } from '../graph';
import type { RFNodeData } from './nodeData';
import { defaultField, withoutPoints } from '../model/gui';
import { NODE_KINDS } from '../model/nodeKinds';
import { ERROR_PORT } from '../../../../graph/wiring.ts';
import { registry } from '../../../../graph/nodes/registry.ts';
import { freeId, slugOf } from '../model/ids';
import { put, without } from '../../../../graph/editor/scheduleEdit.ts';
import { moveCards, nodesOf, placed, rerouteEdges } from './scheduleActions';
import { dropOnto, followRenames, graphEdge, pruneDangling, retypeJoined, untouchedInput } from '../model/wires';
import { wireOf } from '../../../../graph/files/flow.ts';
import type { GraphStore } from './graphStore';

type RFNode = Node<RFNodeData>;

/** The store's actions that change the nodes and wires of the open graph. */
export function editActions(
  set: (recipe: (state: GraphStore) => void) => void,
  get: () => GraphStore,
): Pick<GraphStore, 'addNode' | 'connect' | 'addNodeFrom' | 'connectToNewInput' | 'updateNode' | 'deleteNodes'> {
  return {
    addNode: (nodeType, at, fill, step) => {
      get().commit(step);
      const kind = NODE_KINDS[nodeType];
      const id = freeId(kind.idBase ?? nodeType, get().rfNodes.map((existing) => existing.id));
      // Inside a graph a node holds, a node may start otherwise (`placedInside`).
      const made = get().subgraphStack.length ? kind.placedInside?.(kind.create(id)) ?? kind.create(id) : kind.create(id);
      const defaults = kind.placedAmong?.(made, get().rfNodes.map((existing: RFNode) => existing.data.graphNode)) ?? made;
      const graphNode = fill ? fill(defaults) : defaults;
      // Into the table: where it was dropped, else the cell nearest to the point it was given. The columns
      // after it move over, as a card is only ever in a column of its own or in a cell nothing else holds.
      const moved = put(get().table, id, 'kind' in at ? at : get().targetFor(at));
      const nodes = [...nodesOf(get()), graphNode];
      set((state) => {
        // The one marked, as its panel is the one open: the node selected before stayed lit beside it.
        for (const node of state.rfNodes) if (node.selected) node.selected = false;
        state.rfNodes.push({ id, type: 'graphNode', position: { x: 0, y: 0 }, data: { graphNode }, selected: true } as never);
        state.aim = null;
        state.table = moved.table;
        state.rfEdges = rerouteEdges(state.rfEdges, moved);
        moveCards(state, placed(moved.table, nodes));
      });
      return id;
    },

    connect: (wire, coalesce) => {
      // Named the way graph-flow.json writes a wire, and known by its two ends: a
      // graph pasted in or designed by ✨ may call its wires anything.
      const id = wireOf(graphEdge(wire));
      const joins = (edge: Edge): boolean => edge.source === wire.source && edge.target === wire.target
        && (edge.sourceHandle ?? '') === (wire.sourceHandle ?? '') && (edge.targetHandle ?? '') === (wire.targetHandle ?? '');
      if (get().rfEdges.some(joins)) return;
      get().commit(coalesce);
      set((state) => {
        state.rfEdges.push({ ...wire, id } as never);
        retypeJoined(state.rfNodes, state.gui as GuiWidget[], wire);
      });
      // A wire back to a card on its left or beside it moves that card, and what it feeds, to the right.
      get().refit();
    },

    addNodeFrom: (nodeType, at, from) => {
      // The node and its wire are one change: undone, both go.
      const step = `add ${nodeType} from ${from.source}.${from.sourceHandle}`;
      const id = get().addNode(nodeType, at, undefined, step);
      if (get().connectToNewInput({ ...from, target: id }, step)) return id;
      const first = (get().rfNodes.find((node: RFNode) => node.id === id)?.data.graphNode as GraphNode | undefined)?.inputs[0];
      if (first) get().connect({ ...from, target: id, targetHandle: first.id }, step);
      return id;
    },

    connectToNewInput: (wire, coalesce) => {
      const nodeOf = (id: string) => get().rfNodes.find((node: RFNode) => node.id === id)?.data.graphNode as GraphNode | undefined;
      const target = nodeOf(wire.target);
      if (!target || wire.target === wire.source) return false;
      const onto = dropOnto(target);
      if (!onto) return false;
      if (onto !== 'new') {
        get().connect({ ...wire, targetHandle: onto }, coalesce);
        return true;
      }
      const source = nodeOf(wire.source);
      const from = source?.outputs.find((port) => port.id === wire.sourceHandle);
      // From a start point the GUI sends one block to: named after that block.
      const sent = source && registry.node(source.node_type)?.takesPackage ? defaultField(get().gui, source) : undefined;
      // From a node with one output, named after that node: a judge's inputs
      // were "output" and "output2", beside its own output "output".
      const one = source && source.outputs.filter((port) => port.id !== ERROR_PORT).length === 1 ? source.label : undefined;
      const name = sent?.name || one || from?.name || wire.sourceHandle;
      // In place of the input the node was made with, while nothing uses it.
      const replaced = untouchedInput(target, get().rfEdges.some((edge: Edge) => edge.target === target.id && edge.targetHandle === target.inputs[0]?.id));
      const kept = target.inputs.filter((port) => port.id !== replaced);
      // An id a body can use as a key.
      const id = freeId(slugOf(name).replace(/-/g, '_') || 'input', kept.map((port) => port.id), '');
      // The port and its wire are one step: undone, the port goes with the wire.
      const step = coalesce ?? `new input ${target.id}.${id}`;
      get().updateNode(target.id, {
        inputs: [...kept, { id, name, kind: 'input', data_type: 'any', multi: false, required: false, description: '' }],
      }, undefined, step);
      get().connect({ ...wire, targetHandle: id }, step);
      return true;
    },

    updateNode: (nodeId, updates, renamed, coalesce) => {
      get().commit(coalesce);
      set((state) => {
        const idx = state.rfNodes.findIndex((n: RFNode) => n.id === nodeId);
        if (idx !== -1) {
          const existing = state.rfNodes[idx].data.graphNode;
          const updated = { ...existing, ...updates } as GraphNode;
          state.rfNodes[idx].data.graphNode = updated;

          // A renamed port keeps its wires; a removed one loses them by name.
          if (renamed) state.rfEdges = followRenames(state.rfEdges as Edge[], nodeId, renamed);
          // Ports may have shrunk (an output.js that names fewer): no wire dangles off one that is gone.
          if (updates.inputs || updates.outputs) state.rfEdges = pruneDangling(state.rfEdges as Edge[], updated);
        }
      });
      // What a node holds can change which of its wires go back (a memory's), and so the order.
      if (updates.inputs || updates.outputs || updates.config) get().refit();
    },

    deleteNodes: (nodeIds, wireIds = []) => {
      const going = new Set(nodeIds);
      const cut = new Set(wireIds);
      get().commit();
      // The cards that are left close up over the gap.
      const moved = without(get().table, going);
      const staying = nodesOf(get()).filter((node) => !going.has(node.id));
      set((state) => {
        state.rfNodes = state.rfNodes.filter((n: RFNode) => !going.has(n.id));
        state.rfEdges = rerouteEdges(state.rfEdges.filter(
          (e: Edge) => !cut.has(e.id) && !going.has(e.source) && !going.has(e.target)
        ), moved);
        state.table = moved.table;
        moveCards(state, placed(moved.table, staying));
        // A block connected to a point that went loses that connection with
        // it: left naming it, the block fires and shows nothing.
        state.gui = withoutPoints(state.gui as GuiWidget[], nodeIds) as never;
        // A panel open on a node that went closes with it: left pointing at
        // the id, it opened again on the next node of that id.
        if (state.editingNodeId && going.has(state.editingNodeId)) state.editingNodeId = null;
        // What a round made of a node that is gone is not shown on the next node of that id.
        const shown = state.executionResult;
        if (shown) state.executionResult = { ...shown, node_results: shown.node_results.filter((one) => !going.has(one.node_id)) } as never;
      });
    },
  };
}
