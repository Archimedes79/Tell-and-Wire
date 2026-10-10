// Taking in what another editor changed in the project folder on disk.

import type { Edge } from 'reactflow';
import { lostWire, pageOf, takeIn, withDiskChanges } from '../document/graphDoc';
import { graphEdge } from '../document/wires';
import { NESTED_GRAPH_FIELD } from '../../../backend/app/project/changes.ts';
import { endCoalescing } from './history';
import type { GraphStore } from './graphStore';

/** The store's action that takes code, prompts, the page and nested graphs that changed on disk. */
export function diskActions(
  set: (recipe: (state: GraphStore) => void) => void,
  get: () => GraphStore,
): Pick<GraphStore, 'takeDiskChanges'> {
  return {
    takeDiskChanges: (changes) => {
      const wasClean = !get().isDirty();
      const nodeOf = (id: string | null) => (id === null ? undefined : get().rfNodes.find((n) => n.id === id)?.data.graphNode);
      // A whole graph a node holds, changed in its own folder, is taken only
      // into a document with nothing unsaved in it: unlike a text, which
      // patches one field, it replaces every node, edge and position in that
      // graph. Over unsaved work it would be silent and total, so it is left
      // on disk and said out loud instead.
      const refused = changes.filter((change) => change.field === NESTED_GRAPH_FIELD && !wasClean && nodeOf(change.node_id))
        .map((change) => change.node_id!);
      // What is taken: a change to a node that is here, or to the page, which
      // changes it. The step was taken first, and was an empty one -- Redo
      // thrown away -- when every change was refused, for a node gone, or what
      // the node held.
      const taken = changes.filter((change) => {
        // The page's own text, page.json: its blocks. Only at the top: a graph inside a node has none.
        if (change.node_id === null) return !get().subgraphStack.length && JSON.stringify(get().page) !== JSON.stringify(change.value ?? []);
        const node = nodeOf(change.node_id);
        if (!node) return false;
        if (change.field === NESTED_GRAPH_FIELD) return wasClean;
        return JSON.stringify((node.config as unknown as Record<string, unknown>)[change.field]) !== JSON.stringify(change.value);
      });
      if (!taken.length) return { taken: [], refused };
      // Not an undo step: it is in every state Undo and Redo go to, so that no
      // Undo brings the old text back to be saved over what the other editor wrote.
      endCoalescing();
      set((state) => {
        for (const change of taken) {
          if (change.node_id === null) state.page = pageOf(change) as never;
          else takeIn(state.rfNodes.find((n) => n.id === change.node_id)!.data.graphNode, change);
        }
        const touched = new Set(taken.flatMap((change) => change.node_id ?? []));
        const nodes = state.rfNodes.map((n) => n.data.graphNode);
        state.rfEdges = state.rfEdges.filter((edge: Edge) => !lostWire(nodes, graphEdge(edge), touched));
        state.past = state.past.map((snapshot) => withDiskChanges(snapshot, taken));
        state.future = state.future.map((snapshot) => withDiskChanges(snapshot, taken));
        // What is on disk is saved: with unsaved work here, the saved state has it too, so only that work is unsaved.
        if (!wasClean && state.savedSnapshot !== null) state.savedSnapshot = withDiskChanges(state.savedSnapshot, taken);
      });
      if (wasClean) get().markSaved();
      // Said by what changed: a node by its id, the page as "page".
      return { taken: [...new Set(taken.map((change) => change.node_id ?? 'page'))], refused };
    },
  };
}
