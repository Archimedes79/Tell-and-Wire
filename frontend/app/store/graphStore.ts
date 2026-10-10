import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Node, Edge } from 'reactflow';
import type { Graph, GraphNode, GraphMetadata, ExecutionResult, GuiWidget, NodeType } from '../graph';
import type { RFNodeData } from './nodeData';
import type { PortRenames } from './portRenames';
import { call, type RoundSnapshot } from '../api/client';
import { forgetSession, stopRound, useSession } from '../api/session';
import {
  buildReactFlowGraph, defaultMetadata, exported, normalizeGraph,
} from '../document/graphDoc';
import { endCoalescing, historyActions } from './history';
import { flushPanels } from './flushPanels';
import { subgraphActions } from './subgraphs';
import { diskActions } from './diskChanges';
import { editActions } from './nodeEdits';
import { goingIn, handoffActions, isHanding, serverHoldsAnother } from './handoff';
import type { TextChange } from '../../../backend/app/api.ts';
import { wireOf } from '../../../backend/app/project/flow.ts';

export interface GraphStore {
  // ReactFlow state
  rfNodes: Node<RFNodeData>[];
  rfEdges: Edge[];

  // Graph metadata
  metadata: GraphMetadata;

  /**
   * The page the graph is used through: its blocks, in order -- none, for a
   * graph without one. Beside the nodes and not among them: a block connects
   * itself to the graph's start and end points by name, and nothing is wired
   * to it. The graph open is the one whose page this is; a graph inside a
   * node has none.
   */
  page: GuiWidget[];

  // Absolute server-side path this graph was last loaded from/saved to, or
  // null for an untitled graph -- lets "Save" write back to it directly.
  currentFilePath: string | null;
  /** The path is a project folder: its code and prompts are files that may change outside. */
  isProject: boolean;

  // Execution state
  executionResult: ExecutionResult | null;
  /**
   * The server holds another document's session now: another tab or window
   * handed it one, or the server started anew. Its rounds are not this
   * document's; handing it this one again (`holdDocument`, as ▶ Run does) ends it.
   */
  heldElsewhere: boolean;

  /**
   * The graphs this one is inside, outermost first: one frame per node that
   * was opened, each with the undo history of its own level.
   *
   * One document is open at a time, and going into a node swaps which. That
   * keeps the canvas, the run button and undo exactly as they are, and it is
   * why nothing in here says "subgraph" twice.
   */
  subgraphStack: { nodeId: string; graph: Graph; past: string[]; future: string[] }[];

  /**
   * Which graph is open: one more each time another is loaded, or the canvas
   * goes into a node's graph or back out. Work that takes a while -- a run, a
   * ✨ sweep -- notes it when it starts, and writes nothing into a graph that
   * is not the one it started on: node ids repeat from graph to graph
   * (`code`, `ai_2`), and a result landing by id lands on a stranger.
   */
  document: number;
  /**
   * Which document is open: one more each time another is loaded -- not when
   * the canvas goes into a node's graph and out, which `document` counts too.
   * What belongs to the document as a whole, the application ▶ Run started,
   * ends with it.
   */
  opened: number;

  // Serialised graph as of the last load/save, for `isDirty`.
  savedSnapshot: string | null;

  // Undo history: serialised graphs, oldest first. `past` holds states before
  // each committed change, `future` the ones an undo stepped back out of.
  past: string[];
  future: string[];

  // UI state
  /** The node open in the node view, in place of the canvas: the one the person is working on. */
  editingNodeId: string | null;

  // Actions
  /** Nothing selected and no node open: what a click on the empty canvas does. */
  clearSelection: () => void;
  /**
   * The graph on the canvas replaced by *graph* -- this graph, changed, its
   * ids kept -- as one undo step of this document: the file it came from
   * stays, and so does the panel of a node that is still there.
   */
  changeGraph: (graph: Graph) => void;
  /**
   * Change what the graph is called, what it does, its page's scheme: a
   * change like any other, one undo step per field typed into (`commit`).
   * The tool's name and description took none, so an Undo meant for the
   * block added before them took them too.
   */
  setMetadata: (meta: Partial<GraphMetadata>) => void;
  /**
   * The page's blocks replaced by *blocks*, as one undo step -- named by
   * *coalesce*, as a node's panel names its own (`commit`) -- and, with
   * *add*, those nodes put into the graph in the same step: a block's start
   * or end point, made with the block (`page/pageWrite.ts`).
   */
  setPage: (blocks: GuiWidget[], options?: { coalesce?: string; add?: GraphNode[] }) => void;
  setCurrentFilePath: (path: string | null, isProject?: boolean) => void;
  /**
   * Add a node and return its id, so a caller can immediately fill it in --
   * or, with *fill*, as it is made, in the same undo step: a block and the
   * start point it makes are one change. *step* names the undo step (`commit`),
   * so what the caller does next under the same name is part of it.
   */
  addNode: (nodeType: NodeType, position: { x: number; y: number }, fill?: (node: GraphNode) => GraphNode, step?: string) => string;
  /**
   * Add a node where a wire was let go on empty canvas, and wire it to what
   * the wire came from: on a new input where the node's inputs are its own to
   * name (a code or AI node), else on its first. One undo step, the node and
   * its wire. A node with no input takes no wire, and is only added.
   */
  addNodeFrom: (nodeType: NodeType, position: { x: number; y: number }, from: { source: string; sourceHandle: string }) => string;
  /**
   * `renamed` maps a port's old id to its new one, per side, so the wires
   * follow the rename instead of being pruned as "a port that vanished" --
   * and to null for a port that was removed, whose wires go even when another
   * port has been given its name since (`portRenames`). `coalesce` makes it
   * one undo step with the change just before it of the same name (`commit`).
   */
  updateNode: (
    nodeId: string,
    updates: Partial<GraphNode>,
    renamed?: PortRenames,
    coalesce?: string,
  ) => void;
  /**
   * Wire one port to another: what dragging from a handle to a handle does.
   * Here and not in the canvas, so that a graph can be built -- and a test can
   * build one -- without a mouse. The same wire twice is one wire.
   */
  connect: (wire: { source: string; sourceHandle: string; target: string; targetHandle: string }, coalesce?: string) => void;
  /**
   * Wire an output to a new input of *target*, named after what arrives: what
   * dropping a wire on a node rather than on one of its dots does. Only on a
   * node whose inputs are its own to name -- a code or AI node -- and not on
   * the node the wire starts at. Whether it wired anything. *step* names the
   * undo step, as in `addNode`; a step of its own without it.
   */
  connectToNewInput: (wire: { source: string; sourceHandle: string; target: string }, step?: string) => boolean;
  /**
   * Take *nodeIds* off the graph with every wire into or out of them, and the
   * wires *wireIds* besides: one undo step, however much goes. Nothing is asked.
   */
  deleteNodes: (nodeIds: string[], wireIds?: string[]) => void;
  setRFNodes: (nodes: Node<RFNodeData>[]) => void;
  setRFEdges: (edges: Edge[]) => void;
  setEditingNode: (nodeId: string | null) => void;
  /** What the canvas shows the rounds made: none, before anything ran. */
  setExecutionResult: (result: ExecutionResult | null) => void;
  /**
   * Open *graph* as the document, stopping the run of the one it replaces.
   * *unsaved*: it is at no file and counts as unsaved (a graph ✨ designed).
   * Says the wires it had to leave out, to nodes that are not there.
   */
  loadGraph: (graph: Graph, options?: { unsaved?: boolean }) => { dropped: string[] };
  /**
   * An empty graph with the format's default settings, as a document of its
   * own: nothing of the one before it -- its pinned AI, its colour scheme,
   * its undo steps -- carries over.
   */
  newGraph: () => void;
  exportGraph: () => Graph;
  /** Go into the graph a node holds. It becomes the open document. */
  openSubgraph: (nodeId: string) => void;
  /** Come back out one level, putting what was edited back into the node that holds it. */
  closeSubgraph: () => void;
  /**
   * Come back out until *depth* levels are left -- 0 is the graph at the top --
   * or as far as a run in flight allows: a level that will not close ends it,
   * where asking again would ask forever.
   */
  closeSubgraphsTo: (depth: number) => void;
  /**
   * The whole document: what is open, folded back through every node it is
   * inside. What is saved, and what "unsaved" is measured against, whatever
   * level the canvas happens to be showing.
   */
  rootGraph: () => Graph;
  /**
   * Record the current graph as an undo point, BEFORE the change about to be
   * made. Committing an identical state twice is a no-op: with nothing changed
   * since the step before, a second step would be a press of Ctrl+Z that undoes
   * nothing.
   *
   * *coalesce* names the change -- a node and the fields its panel wrote. A
   * change of the same name within a moment of the last one adds to that
   * one's undo step instead of taking one of its own: a word typed into a
   * field is one step, not one per keystroke. Anything else in between -- an
   * unnamed change, an undo, another document -- ends it.
   */
  commit: (coalesce?: string) => void;
  undo: () => void;
  redo: () => void;
  /**
   * Internal: replace the graph with a serialised snapshot (used by undo/redo).
   * *keepEditing*: the node's panel stays open when its node is still there --
   * Undo takes back what it changed, and it shows what Undo left.
   */
  applyGraphSnapshot: (json: string, keepEditing?: boolean) => void;
  /**
   * Whether the graph differs from the last loaded or saved version.
   *
   * Computed by comparing the exported graph against a snapshot rather than
   * tracked with a flag on every mutation: ReactFlow reports a plain click as a
   * node change, so a flag would mark a freshly opened graph dirty and train
   * the user to click through the confirmations that exist to protect them.
   * Selection is not part of the exported graph, so this cannot fire on it;
   * moving a node, which is a real change, does. Asked again of the same
   * document, it answers what it answered (`dirtyAnswer`).
   */
  isDirty: () => boolean;
  /** Record the current graph as saved (after a successful write to disk). */
  markSaved: () => void;
  /**
   * Write the whole document to *path* -- the one it was opened from or last
   * saved to, when none is given -- and be at the path it was written to.
   *
   * What counts as saved is the graph that was sent, not the one there is when
   * the write comes back: an edit made while it was on its way is not on disk,
   * and must still read as unsaved. Save, Save As and a file chip -- which saves
   * before it opens a file -- each wrote this out, and each marked the later graph saved.
   *
   * A graph that is already at *path* is written over when it is this one's
   * own file, or *replace* says the person chose to; the server refuses
   * anything else (`Failure.taken`). *name*: the graph is called that as it
   * is written -- and only once it is: a save refused renames nothing.
   */
  save: (path?: string, as?: { replace?: boolean; name?: string }) => Promise<{ path: string }>;
  /**
   * Take in code and prompts that changed in the project folder on disk.
   *
   * No undo step: what the other editor wrote is in every state Undo and Redo
   * go to, so Undo never brings the old text back to be saved over it. What
   * is on disk is saved by definition: a graph that was clean stays clean,
   * and one with unsaved edits keeps exactly those. Says the nodes whose
   * change it took, and those whose graph was left on disk because there is
   * unsaved work here.
   */
  takeDiskChanges: (changes: TextChange[]) => { taken: string[]; refused: string[] };
  /**
   * Hand the server's session the document: what every round runs, whoever
   * starts it -- the App tab, the Page tab, the clock, the tool opened in a
   * window of its own. What runs, not how each node was written: a node's
   * history is up to half a megabyte, and a round reads none of it. It is
   * handed over as the document of the session it was given before: another
   * document -- or one whose session another editor took meanwhile -- is
   * given a session of its own, and that session's stream is listened to.
   */
  holdDocument: () => Promise<void>;
  /**
   * A round of the session, as its stream tells it: once it ended, what it
   * made, on the canvas -- how far it is, and whether it goes, is the
   * session's (`goingRound`). A round no event started is all there is to
   * show; one an event started is laid over what was shown. A round of a
   * document opened before this one is not this one's.
   */
  followRound: (round: RoundSnapshot) => void;
}

/**
 * What `isDirty` last answered, and the parts of the store it was worked out
 * from. The header asks on every change of the store -- a tick of a run, a
 * frame of a drag -- and the answer is the whole document serialised: asked
 * again of the same document, it is not worked out again.
 */
let dirtyAnswer: { of: unknown[]; dirty: boolean } | null = null;

export const useGraphStore = create<GraphStore>()(
  immer((set, get) => ({
    rfNodes: [],
    rfEdges: [],
    metadata: defaultMetadata(),
    page: [],
    currentFilePath: null,
    isProject: false,
    executionResult: null,
    heldElsewhere: false,
    editingNodeId: null,
    subgraphStack: [],
    document: 0,
    opened: 0,
    savedSnapshot: null,
    past: [],
    future: [],

    setMetadata: (meta) => {
      // Named without ": ", so it is never taken for a node panel's change (`nodeId: fields`).
      get().commit(`metadata.${Object.keys(meta).join('+')}`);
      set((state) => {
        Object.assign(state.metadata, meta);
      });
    },

    setPage: (blocks, { coalesce, add = [] } = {}) => {
      get().commit(coalesce);
      set((state) => {
        state.page = blocks as never;
        for (const node of add) state.rfNodes.push({ id: node.id, type: 'graphNode', position: node.position, data: { graphNode: node } } as never);
      });
    },

    setCurrentFilePath: (path, isProject = false) =>
      set((state) => {
        state.currentFilePath = path;
        state.isProject = path !== null && isProject;
      }),

    setRFNodes: (nodes) =>
      set((state) => {
        state.rfNodes = nodes as never;
      }),

    setRFEdges: (edges) =>
      set((state) => {
        state.rfEdges = edges;
      }),

    setEditingNode: (nodeId) =>
      set((state) => {
        state.editingNodeId = nodeId;
      }),

    clearSelection: () => {
      // The panel first, on its own: a panel closed while the graph stays
      // writes what still waits in it (`nodePanel.watch`), and the marks
      // below are a change to the canvas's nodes.
      set((state) => {
        state.editingNodeId = null;
      });
      set((state) => {
        for (const node of state.rfNodes) if (node.selected) node.selected = false;
        for (const edge of state.rfEdges) if (edge.selected) edge.selected = false;
      });
    },

    changeGraph: (graph) => {
      get().commit();
      // As an undo step lands: the same document a step on, not another one.
      get().applyGraphSnapshot(JSON.stringify(graph), true);
    },

    // What a round made is shown, never kept in the document: what using the
    // graph leaves behind is the session's (docs/architecture.md, "State").
    setExecutionResult: (shown) =>
      set((state) => {
        state.executionResult = shown;
      }),

    loadGraph: (graph, { unsaved = false } = {}) => {
      const normalizedGraph = normalizeGraph(graph);
      const { rfNodes, rfEdges } = buildReactFlowGraph(normalizedGraph);
      // What it was given and cannot hold, said by whoever loads it: a wire to a node that is not there.
      const kept = new Set(normalizedGraph.edges);
      const dropped = (Array.isArray(graph.edges) ? graph.edges : []).filter((edge) => !kept.has(edge)).map(wireOf);
      endCoalescing();
      // The run of the document being left has no one to show its end to: it is stopped with it.
      if (goingRound()) void stopRound().catch(() => {});

      set((state) => {
        state.metadata = normalizedGraph.metadata;
        state.rfNodes = rfNodes as never;
        state.rfEdges = rfEdges;
        state.page = (normalizedGraph.page?.blocks ?? []) as never;
        state.executionResult = null;
        // Whoever loaded a graph without going through the file-path flow
        // (Paste JSON, ✨ Describe a graph, etc.) doesn't know its file path; the caller
        // sets `currentFilePath` explicitly right after loadGraph when it does.
        state.currentFilePath = null;
        state.isProject = false;
        // A different document: its predecessor's undo steps would restore
        // nodes belonging to a graph that is no longer open, and its frames
        // would fold this one into a node it never came from.
        state.past = [];
        state.future = [];
        state.subgraphStack = [];
        state.editingNodeId = null;
        state.document += 1;
        state.opened += 1;
      });
      // File ▸ New showed the summary the document before had made, on a block of the same id.
      forgetSession();
      // Snapshot through exportGraph() rather than from normalizedGraph: it is
      // the same serialisation isDirty() compares against, so a freshly loaded
      // graph is guaranteed to read as clean. One that is at no file -- ✨ made
      // it -- is not: it is unsaved until it is written somewhere.
      if (unsaved) set((state) => { state.savedSnapshot = null; });
      else get().markSaved();
      return { dropped };
    },

    newGraph: () => get().loadGraph({ metadata: defaultMetadata(), nodes: [], edges: [] }),

    exportGraph: () => {
      const { rfNodes, rfEdges, metadata, page } = get();
      return exported(rfNodes as never, rfEdges, metadata, page as never);
    },

    ...historyActions(set, get),
    ...editActions(set, get),
    ...subgraphActions(set, get),
    ...diskActions(set, get),
    ...handoffActions(set, get),

    isDirty: () => {
      const { rfNodes, rfEdges, metadata, page, subgraphStack, savedSnapshot } = get();
      const of = [rfNodes, rfEdges, metadata, page, subgraphStack, savedSnapshot];
      if (dirtyAnswer?.of.every((part, at) => part === of[at])) return dirtyAnswer.dirty;
      // The whole document, not the level that happens to be open: going into
      // a node changes nothing, and a change made in there is a change.
      const root = get().rootGraph();
      // A never-saved graph counts as dirty only once it has something in it.
      const dirty = savedSnapshot === null ? root.nodes.length > 0 || !!root.page : JSON.stringify(root) !== savedSnapshot;
      dirtyAnswer = { of, dirty };
      return dirty;
    },

    markSaved: () => {
      const snapshot = JSON.stringify(get().rootGraph());
      set((state) => {
        state.savedSnapshot = snapshot;
      });
    },

    save: async (path = get().currentFilePath ?? undefined, { replace = false, name } = {}) => {
      if (!path) throw new Error('This graph has no file yet: use Save As.');
      flushPanels();
      const root = get().rootGraph();
      const graph = name ? { ...root, metadata: { ...root.metadata, name } } : root;
      const result = await call('saveGraph', { path, graph, replace: replace || path === get().currentFilePath });
      set((state) => {
        // The name is the tool's -- the graph at the top -- whichever level the canvas shows.
        if (name) {
          if (state.subgraphStack.length) state.subgraphStack[0].graph.metadata.name = name;
          else state.metadata.name = name;
        }
        state.savedSnapshot = JSON.stringify(graph);
      });
      get().setCurrentFilePath(result.path, result.project);
      return { path: result.path };
    },

  }))
);

/**
 * The round going in this document, or null. Only the session says whether one
 * goes (`useSession`), so a stop button cannot outlive the round it stops --
 * unless the server holds another editor's document now (`heldElsewhere`),
 * whose round is not this one's.
 */
export function goingRound(): RoundSnapshot | null {
  return goingIn(useGraphStore.getState().heldElsewhere);
}

/** `goingRound`, drawn anew as it starts, goes on and ends. */
export function useGoingRound(): RoundSnapshot | null {
  const round = useSession((s) => s.round);
  const elsewhere = useGraphStore((s) => s.heldElsewhere);
  return goingIn(elsewhere) && round;
}

// Every round of the session the editor's document is held in, from whichever
// page or clock started it: the canvas and the toolbar follow it.
useSession.subscribe((state, before) => {
  if (state.view?.session !== before.view?.session && !isHanding() && serverHoldsAnother()) {
    useGraphStore.setState({ heldElsewhere: true });
  }
  if (state.round && state.round !== before.round) useGraphStore.getState().followRound(state.round);
});
