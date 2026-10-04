// The open document's undo history: whole serialised graphs, oldest first, and
// what makes a named change one step (`commit`). The store's `past` and
// `future` hold the states; these are the actions that move through them.

import type { Graph } from '../graph';
import { buildReactFlowGraph, normalizeGraph } from '../document/graphDoc';
import type { GraphStore } from './graphStore';

/** How many undo steps are kept. Each entry is a whole serialised graph. */
export const HISTORY_LIMIT = 50;

/** How long after a named change the next one of that name still belongs to its undo step (`commit`). */
export const COALESCE_MS = 2000;

/**
 * The last undo step a named change began or added to, and when -- or null
 * when the last change had no name. Not state anybody draws, so not in the
 * store: a change of the same name within `COALESCE_MS` adds to that step.
 */
let coalescing: { key: string; at: number } | null = null;

/** What is changed next is not a continuation of what was typed before. */
export function endCoalescing(): void {
  coalescing = null;
}

/** The store's actions that record, step back through and restore its history. */
export function historyActions(
  set: (recipe: (state: GraphStore) => void) => void,
  get: () => GraphStore,
): Pick<GraphStore, 'commit' | 'undo' | 'redo' | 'applyGraphSnapshot'> {
  return {
    commit: (coalesce) => {
      const now = Date.now();
      if (coalesce && coalescing?.key === coalesce && now - coalescing.at < COALESCE_MS) {
        coalescing.at = now;
        return;
      }
      coalescing = coalesce ? { key: coalesce, at: now } : null;
      const snapshot = JSON.stringify(get().exportGraph());
      set((state) => {
        if (state.past[state.past.length - 1] === snapshot) return;
        state.past.push(snapshot);
        // A bounded stack: undo is for recovering from a mistake, not for
        // replaying a whole session, and every entry is a full graph.
        if (state.past.length > HISTORY_LIMIT) state.past.shift();
        // Any new change abandons the redo branch, as in every editor.
        state.future = [];
      });
    },

    undo: () => {
      const { past } = get();
      if (past.length === 0) return;
      const current = JSON.stringify(get().exportGraph());
      const previous = past[past.length - 1];
      set((state) => {
        state.past.pop();
        state.future.push(current);
      });
      get().applyGraphSnapshot(previous, true);
    },

    redo: () => {
      const { future } = get();
      if (future.length === 0) return;
      const current = JSON.stringify(get().exportGraph());
      const next = future[future.length - 1];
      set((state) => {
        state.future.pop();
        state.past.push(current);
      });
      get().applyGraphSnapshot(next, true);
    },

    /**
     * Restore a serialised graph without touching the history stacks or the
     * saved-snapshot marker -- undoing back to the last saved state must read as
     * clean again, and undoing past it as dirty, which falls out of leaving
     * `savedSnapshot` alone.
     */
    applyGraphSnapshot: (json, keepEditing = false) => {
      const graph = normalizeGraph(JSON.parse(json) as Graph);
      const { rfNodes, rfEdges } = buildReactFlowGraph(graph);
      // Whatever came next is not a continuation of what was typed before.
      endCoalescing();
      set((state) => {
        state.metadata = graph.metadata;
        state.rfNodes = rfNodes as never;
        state.rfEdges = rfEdges;
        state.page = (graph.page?.blocks ?? []) as never;
        // Everything that names a node of the graph that was here. Left
        // standing, each points at something that may not exist any more: a
        // result against ids that now mean other nodes, a panel on one of
        // them. The node's panel stays for Undo, on a node that is still there:
        // the same graph, a step back.
        state.executionResult = null;
        const stays = keepEditing && graph.nodes.some((node) => node.id === state.editingNodeId);
        if (!stays) state.editingNodeId = null;
      });
    },
  };
}
