// Going into the graph a node holds, and out again: the frames of the levels
// the canvas is inside, each with the undo history of its own level.

import type { Graph } from '../graph';
import { withNested } from '../document/graphDoc';
import { registry as runnerRegistry } from '../../../graph/nodes/registry.ts';
import { HISTORY_LIMIT } from './history';
import { flushPanels } from './flushPanels';
import { goingIn } from './handoff';
import type { GraphStore } from './graphStore';

/** The store's actions that move between the levels of a document. */
export function subgraphActions(
  set: (recipe: (state: GraphStore) => void) => void,
  get: () => GraphStore,
): Pick<GraphStore, 'openSubgraph' | 'closeSubgraph' | 'closeSubgraphsTo' | 'rootGraph'> {
  // Not while a run is in flight: its result is about to arrive, and it would
  // arrive at a canvas showing a different graph, where node ids that happen to
  // match would be given another level's values.
  const running = () => goingIn(get().heldElsewhere) !== null;
  return {
    openSubgraph: (nodeId) => {
      if (running()) return;
      flushPanels();
      const node = get().rfNodes.find((n) => n.id === nodeId)?.data.graphNode;
      // Whether there is a graph to go into is the same question as whether
      // this node holds one, so it is asked once.
      const held = node && runnerRegistry.node(node.node_type)?.nestedGraph(node as never) as Graph | null;
      if (!held) return;

      const frame = { nodeId, graph: get().exportGraph(), past: get().past, future: get().future };
      // Not `loadGraph`: that is for opening a different *document*, and would
      // throw away the frames this one is inside. What changes here is which
      // level the canvas shows.
      get().applyGraphSnapshot(JSON.stringify(held));
      set((state) => {
        state.subgraphStack.push(frame);
        // Its own level, its own history: an undo in here cannot reach out.
        state.past = [];
        state.future = [];
        state.document += 1;
      });
    },

    closeSubgraph: () => {
      if (running()) return;
      const { subgraphStack } = get();
      const frame = subgraphStack[subgraphStack.length - 1];
      if (!frame) return;
      flushPanels();
      const inner = get().exportGraph();
      const merged = withNested(frame.graph, frame.nodeId, inner);
      const before = JSON.stringify(frame.graph);
      const changed = JSON.stringify(merged) !== before;

      get().applyGraphSnapshot(JSON.stringify(merged));
      set((state) => {
        state.subgraphStack.pop();
        // Everything done in there is one step out here, like any other change
        // to this node. Without it the first Ctrl+Z after coming out would
        // restore the graph as it was before going in -- an hour of work, one
        // keystroke, and nothing to say it was about to happen.
        state.past = changed ? [...frame.past, before].slice(-HISTORY_LIMIT) : frame.past;
        state.future = changed ? [] : frame.future;
        state.document += 1;
      });
    },

    closeSubgraphsTo: (depth) => {
      while (get().subgraphStack.length > depth) {
        const before = get().subgraphStack.length;
        get().closeSubgraph();
        if (get().subgraphStack.length === before) return;
      }
    },

    rootGraph: () => {
      const { subgraphStack } = get();
      let graph = get().exportGraph();
      for (let level = subgraphStack.length - 1; level >= 0; level -= 1) {
        graph = withNested(subgraphStack[level].graph, subgraphStack[level].nodeId, graph);
      }
      return graph;
    },
  };
}
