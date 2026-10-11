// The schedule in the store: where the cards stand, where a card held would land, and the
// routes of wires. The table is the truth (`graph/schedule.ts`); a card's position is worked out
// from it and the sizes people gave (`model/scheduleLayout.ts`) and written into the nodes, so
// the canvas draws what the table says and a saved graph needs nothing else.

import type { Edge, Node } from 'reactflow';
import type { GraphEdge, GraphNode } from '../graph';
import type { RFNodeData } from './nodeData';
import { registry } from '../../../../graph/nodes/registry.ts';
import { cellName, columnsOf, orderedWires, parseCell, tableFor, tableLines, thinTable, type Table } from '../../../../graph/schedule.ts';
import { loopNodes } from '../../../../graph/order.ts';
import { ANYWHERE, put, reachOf, rerouted, type Moved } from '../../../../graph/editor/scheduleEdit.ts';
import { aim, CARD, gridOf, routeAim, snapped, topLeft, type Opening } from '../model/scheduleLayout';
import { graphEdge } from '../model/wires';
import { sizesOf } from '../model/graphDoc';
import type { GraphStore } from './graphStore';

type RFNode = Node<RFNodeData>;

/** The id a card being brought in from the palette is held under. */
export const NEW = '_new';

export const nodesOf = (s: Pick<GraphStore, 'rfNodes'>): GraphNode[] => s.rfNodes.map((node) => node.data.graphNode);
export const edgesOf = (s: Pick<GraphStore, 'rfEdges'>): GraphEdge[] => s.rfEdges.map((edge) => graphEdge(edge));

/**
 * What limits where a card may be put: the wires that must end in a later column, and -- apart from those -- the wires out of
 * a memory, which a card may have on either side of it (left: it reads what the memory held as the round began; right: what it holds then).
 */
function limits(s: Pick<GraphStore, 'rfEdges' | 'table'>, nodes: GraphNode[]): [[string, string][], [string, string][]] {
  const memories = new Set(nodes.filter((node) => registry.node(node.node_type)?.isMemory === true).map((node) => node.id));
  const edges = edgesOf(s);
  const ordered = orderedWires(nodes, edges, registry, columnsOf(s.table));
  return [ordered.filter(([from]) => !memories.has(from)), edges.filter((edge) => memories.has(edge.source_node_id)).map((edge) => [edge.source_node_id, edge.target_node_id])];
}

/** Where the cards stand for *table*: each one's top left. */
export function placed(table: Table, nodes: GraphNode[], opening?: Opening): Map<string, { x: number; y: number }> {
  const sizes = sizesOf(nodes);
  const grid = gridOf(table, sizes, opening);
  return new Map(nodes.map((node) => [node.id, topLeft(grid.centres.get(node.id) ?? { x: 0, y: 0 }, sizes.get(node.id))]));
}

/** The cards moved to *at*, but for *except*: the one in the hand. */
export function moveCards(state: Pick<GraphStore, 'rfNodes'>, at: ReadonlyMap<string, { x: number; y: number }>, except?: string): void {
  for (const node of state.rfNodes) {
    const to = at.get(node.id);
    if (to && node.id !== except) node.position = to;
  }
}

/**
 * The wires with their routes carried to where the cells went -- and only those that still run between the ends of
 * their wire: a route is drawn through a column between the two (`routeAim`), and a card moved past it leaves it behind.
 */
export function rerouteEdges(edges: Edge[], moved: Moved): Edge[] {
  const column = columnsOf(moved.table);
  return edges.map((edge) => {
    const via = (edge.data as { via?: string[] } | undefined)?.via;
    if (!via?.length) return edge;
    const [kept] = rerouted([{ via }], moved);
    const from = column.get(edge.source);
    const to = column.get(edge.target);
    const between = from === undefined || to === undefined ? [] : (kept.via ?? []).filter((name) => {
      const cell = parseCell(name);
      return !!cell && cell.column > Math.min(from, to) && cell.column < Math.max(from, to);
    });
    return { ...edge, data: between.length ? { via: between } : undefined };
  });
}

const still = (table: Table): Moved => ({ table, column: (c) => c, row: (r) => r });

/** The store's actions on the schedule. */
export function scheduleActions(
  set: (recipe: (state: GraphStore) => void) => void,
  get: () => GraphStore,
): Pick<GraphStore, 'refit' | 'aimCard' | 'clearAim' | 'springBack' | 'dropCard' | 'targetFor' | 'thinOut' | 'resizeCard' | 'routeWire' | 'pullWire' | 'endPull'> {
  return {
    refit: () => {
      const s = get();
      const nodes = nodesOf(s);
      const table = tableFor(nodes, edgesOf(s), registry, s.table.length ? tableLines(s.table) : undefined);
      if (JSON.stringify(table) === JSON.stringify(s.table)) return;
      set((state) => {
        state.table = table;
        moveCards(state, placed(table, nodes));
        state.rfEdges = rerouteEdges(state.rfEdges, still(table));
      });
    },

    aimCard: (id, centre) => {
      const s = get();
      const nodes = nodesOf(s);
      const reach = id === NEW ? ANYWHERE : reachOf(s.table, id, ...limits(s, nodes));
      const was = s.aim?.id === id ? s.aim.opens : null;
      const next = aim(s.table, sizesOf(nodes), reach, id === NEW ? null : id, centre, was);
      if (s.aim?.id === id && s.aim.opens === next.opens && JSON.stringify(s.aim.target) === JSON.stringify(next.target)) return;
      set((state) => {
        state.aim = { id, reach, opens: next.opens, target: next.target };
        // The columns after the one that opens slide over; the card in the hand is the hand's.
        if (next.opens !== was) moveCards(state, placed(s.table, nodes, { column: next.opens }), id);
      });
    },

    clearAim: () => {
      const s = get();
      if (!s.aim) return;
      set((state) => {
        state.aim = null;
        moveCards(state, placed(s.table, nodesOf(s)));
      });
    },

    springBack: () => {
      const s = get();
      set((state) => {
        state.aim = null;
        moveCards(state, placed(s.table, nodesOf(s)));
      });
    },

    dropCard: (id) => {
      const s = get();
      const at = s.aim?.id === id ? s.aim.target : null;
      const nodes = nodesOf(s);
      if (!at) {
        set((state) => {
          state.aim = null;
          moveCards(state, placed(s.table, nodes));
        });
        return;
      }
      const moved = put(s.table, id, at);
      // A drag that ends where it began is no change: no undo step, and no Redo thrown away.
      if (JSON.stringify(moved.table) !== JSON.stringify(s.table)) get().commit();
      set((state) => {
        state.aim = null;
        state.table = moved.table;
        state.rfEdges = rerouteEdges(state.rfEdges, moved);
        moveCards(state, placed(moved.table, nodes));
      });
    },

    // Where a card dropped with its top left at *point* would go: for what is added from the palette.
    targetFor: (point) => {
      const s = get();
      const found = aim(s.table, sizesOf(nodesOf(s)), ANYWHERE, null, { x: point.x + CARD.width / 2, y: point.y + CARD.height / 2 }, null).target;
      return found ?? { kind: 'gap', k: Math.max(0, ...s.table.map((row) => row.length)), r: 0 };
    },

    thinOut: () => {
      const s = get();
      const nodes = nodesOf(s);
      const before = s.table;
      // With a loop no memory closes there is no order to thin out to, and the table would collapse to one card to a column.
      const loop = loopNodes(nodes, edgesOf(s), registry);
      if (loop.length) return `Cannot thin out while the wires go round in a loop through ${loop.map((one) => `"${one.label || one.id}"`).join(', ')}: close it through a data node first.`;
      const table = thinTable(nodes, edgesOf(s), registry, before);
      const count = (n: number, what: string): string => `${n} ${what}${n === 1 ? '' : 's'}`;
      const size = (t: Table): string => `${count(Math.max(0, ...t.map((row) => row.length)), 'column')}, ${count(t.length, 'row')}`;
      if (JSON.stringify(table) === JSON.stringify(before)) return `Already thin: ${size(before)}.`;
      get().commit();
      set((state) => {
        state.table = table;
        moveCards(state, placed(table, nodes));
        // The routes were drawn through cells of the table as it was.
        state.rfEdges = state.rfEdges.map((edge) => (edge.data?.via ? { ...edge, data: undefined } : edge));
      });
      return `Thinned out: ${size(before)} became ${size(table)}.`;
    },

    resizeCard: (id, size) => {
      const want = snapped(size);
      const card = get().rfNodes.find((one: RFNode) => one.id === id);
      if (!card) return;
      // A click on the grip ends where it began: nothing was resized, so no card is pinned to the size it happens to have, and no step is added.
      const { width, height } = card.data.graphNode;
      const unchanged = typeof width === 'number' ? width === want.width && height === want.height : card.width === size.width && card.height === size.height;
      if (unchanged) return;
      get().commit();
      set((state) => {
        const node = state.rfNodes.find((one: RFNode) => one.id === id);
        if (!node) return;
        node.data.graphNode.width = want.width;
        node.data.graphNode.height = want.height;
        node.style = { ...node.style, width: want.width, height: want.height };
      });
      const s = get();
      set((state) => moveCards(state, placed(s.table, nodesOf(s))));
    },

    routeWire: (edgeId, cell) => {
      const now = get().rfEdges.find((one: Edge) => one.id === edgeId)?.data?.via as string[] | undefined;
      const next = cell ? [cellName(cell.column, cell.row)] : undefined;
      // The route it already has is no change: no undo step.
      if (now?.join() === next?.join()) {
        set((state) => { state.pulling = null; });
        return;
      }
      get().commit();
      set((state) => {
        state.pulling = null;
        const edge = state.rfEdges.find((one: Edge) => one.id === edgeId);
        if (edge) edge.data = cell ? { via: [cellName(cell.column, cell.row)] } : undefined;
      });
    },

    pullWire: (edgeId, centre) => {
      const s = get();
      const edge = s.rfEdges.find((one: Edge) => one.id === edgeId);
      const column = columnsOf(s.table);
      const from = edge && column.get(edge.source);
      const to = edge && column.get(edge.target);
      const grid = gridOf(s.table, sizesOf(nodesOf(s)), { row: true });
      const cell = from === undefined || to === undefined ? null : routeAim(s.table, grid, from, to, centre);
      if (s.pulling?.edge === edgeId && s.pulling.cell?.column === cell?.column && s.pulling.cell?.row === cell?.row) return;
      set((state) => { state.pulling = { edge: edgeId, cell }; });
    },

    endPull: (apply) => {
      const pulling = get().pulling;
      if (apply && pulling?.cell) get().routeWire(pulling.edge, pulling.cell);
      else set((state) => { state.pulling = null; });
    },
  };
}
