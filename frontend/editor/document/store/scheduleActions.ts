// The schedule in the store: where the cards stand, where a card held would land, and the
// routes of wires. The table is the truth (`graph/schedule.ts`); a card's position is worked out
// from it and the sizes people gave (`model/scheduleLayout.ts`) and written into the nodes, so
// the canvas draws what the table says and a saved graph needs nothing else.

import type { Edge, Node } from 'reactflow';
import type { GraphEdge, GraphNode } from '../graph';
import type { RFNodeData } from './nodeData';
import { registry } from '../../../../graph/nodes/registry.ts';
import { cellName, columnsOf, orderedWires, tableFor, tableLines, thinTable, type Table } from '../../../../graph/schedule.ts';
import { ANYWHERE, put, reachOf, rerouted, type Moved } from '../../../../graph/editor/scheduleEdit.ts';
import { aim, CARD, gridOf, routeAim, snapped, topLeft, type Opening } from '../model/scheduleLayout';
import { graphEdge } from '../model/wires';
import { sizesOf } from '../model/graphDoc';
import type { GraphStore } from './graphStore';

type RFNode = Node<RFNodeData>;

/** The id a card being brought in from the palette is held under. */
export const NEW = '_new';

export const nodesOf = (s: Pick<GraphStore, 'rfNodes'>): GraphNode[] => s.rfNodes.map((node) => node.data.graphNode);
const edgesOf = (s: Pick<GraphStore, 'rfEdges'>): GraphEdge[] => s.rfEdges.map((edge) => graphEdge(edge));

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

/** The wires with their routes carried to where the cells went. */
export function rerouteEdges(edges: Edge[], moved: Moved): Edge[] {
  return edges.map((edge) => {
    const via = (edge.data as { via?: string[] } | undefined)?.via;
    if (!via?.length) return edge;
    const [kept] = rerouted([{ via }], moved);
    return { ...edge, data: kept.via ? { via: kept.via } : undefined };
  });
}

const still = (table: Table): Moved => ({ table, column: (c) => c, row: (r) => r });

/** The store's actions on the schedule. */
export function scheduleActions(
  set: (recipe: (state: GraphStore) => void) => void,
  get: () => GraphStore,
): Pick<GraphStore, 'refit' | 'aimCard' | 'clearAim' | 'dropCard' | 'targetFor' | 'thinOut' | 'resizeCard' | 'routeWire' | 'pullWire' | 'endPull'> {
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
      const reach = id === NEW ? ANYWHERE : reachOf(s.table, id, orderedWires(nodes, edgesOf(s), registry));
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
      get().commit();
      const s = get();
      const nodes = nodesOf(s);
      const before = s.table;
      const table = thinTable(nodes, edgesOf(s), registry, before);
      const size = (t: Table): string => `${Math.max(0, ...t.map((row) => row.length))} columns, ${t.length} rows`;
      if (JSON.stringify(table) === JSON.stringify(before)) return `Already thin: ${size(before)}.`;
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
