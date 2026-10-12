import React, { useCallback, useMemo, useRef, DragEvent } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  Connection,
  OnConnectStartParams,
  NodeChange,
  EdgeChange,
  BackgroundVariant,
  ReactFlowInstance,
  Panel,
  getNodesBounds,
  getViewportForBounds,
  useStore,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { useGraphStore } from '../../document/store/graphStore';
import { useEditorScheme } from '../../document/store/editorScheme';
import { NODE_BUILDERS } from '../../document/elements/registry';
import { NODE_KINDS } from '../../document/model/nodeKinds';
import QuickPick from '../../../deployment/gui/kit/ui/QuickPick';
import GraphNodeView from './GraphNodeView';
import RoutedEdge from './RoutedEdge';
import ScheduleLayer from './ScheduleLayer';
import ThinOut from './ThinOut';
import { useGlide } from './useGlide';
import { NEW, edgesOf, nodesOf } from '../../document/store/scheduleActions';
import { sizesOf } from '../../document/model/graphDoc';
import { CARD, gridOf, topLeft } from '../../document/model/scheduleLayout';
import { cellName, columnsOf, parseCell } from '../../../../graph/schedule.ts';
import { readingWires } from '../../../../graph/order.ts';
import { registry } from '../../../../graph/nodes/registry.ts';
import { deleteSelected, deletes } from './nodeRemoval';
import { drawnWire } from './wireLook';
import { allInView, panToShow, READABLE_ZOOM, viewDue, type ViewDue } from './inView';
import type { NodeType } from '../../document/graph';
import { LINE, MUTED, PANEL, SUNKEN, SURFACE } from '../../../deployment/gui/kit/ui/theme';
import { scheme } from '../../../deployment/gui/kit/ui/scheme';

const nodeTypes = { graphNode: GraphNodeView };
const edgeTypes = { routed: RoutedEdge };

/**
 * What a wire let go on empty canvas can lead to: each kind the palette offers
 * that has an input to take the wire -- a start point has none.
 */
const PICKABLE = Object.values(NODE_BUILDERS)
  .filter((builder) => builder.paletteGroup && NODE_KINDS[builder.nodeType].create('probe').inputs.length > 0)
  .map((builder) => ({ type: builder.nodeType, label: builder.label, icon: builder.icon, ink: builder.ink, also: builder.hint }));

/**
 * @param active Whether the canvas is the one on screen: the graph tab, and no
 *   node open in its place.
 *
 * A click on a node chooses it; a double-click, or Enter on it, opens it in the
 * node view (`editingNodeId`).
 *
 * The canvas stays mounted while another tab or a node is shown, so coming
 * back keeps the viewport and the selection. Its keyboard shortcuts stayed
 * live with it: pressing Delete on the surface designer removed the selected
 * block *and* the node selected back on the canvas -- so Delete looked like it
 * deleted more than it was pressed for. Keys belong to the view you are looking at.
 */
export default function GraphCanvas({ active }: { active: boolean }) {
  const rfNodes = useGraphStore((s) => s.rfNodes);
  const editorScheme = useEditorScheme((s) => s.resolved);
  const rfEdges = useGraphStore((s) => s.rfEdges);
  const setRFNodes = useGraphStore((s) => s.setRFNodes);
  const setRFEdges = useGraphStore((s) => s.setRFEdges);
  const connect = useGraphStore((s) => s.connect);
  const setEditingNode = useGraphStore((s) => s.setEditingNode);
  const clearSelection = useGraphStore((s) => s.clearSelection);
  // The nodes whose wires are drawn in the accent, as one string: it changes
  // when the selection does, not on every frame of a drag.
  const lit = useGraphStore((s) => s.rfNodes.filter((n) => n.selected).map((n) => n.id).join('\n'));
  // Where the wires are drawn through: the centres of the cells a route names -- and, for the wire
  // being pulled, the cell it would go through. Followed through the columns that slide over.
  const table = useGraphStore((s) => s.table);
  const opens = useGraphStore((s) => s.aim?.opens ?? null);
  const pulling = useGraphStore((s) => s.pulling);
  const sized = useGraphStore((s) => s.rfNodes.map((n) => `${n.id}:${n.data.graphNode.width ?? ''}x${n.data.graphNode.height ?? ''}`).join('|'));
  const edges = useMemo(() => {
    const selected = new Set(lit.split('\n'));
    const state = useGraphStore.getState();
    const column = columnsOf(table);
    // A wire from a memory to a card in an earlier column reads what it held when the round began: drawn dotted.
    const reads = readingWires(nodesOf(state), edgesOf(state), registry, column);
    // With the row below the table: a route may go through it, whether or not one is being pulled.
    const grid = gridOf(table, sizesOf(nodesOf(state)), { column: opens, row: true });
    return rfEdges.map((edge) => {
      const named = pulling?.edge === edge.id ? (pulling.cell ? [cellName(pulling.cell.column, pulling.cell.row)] : []) : (edge.data?.via as string[] | undefined) ?? [];
      const points = named.flatMap((name) => {
        const cell = parseCell(name);
        const column = cell && grid.cols[opens !== null && cell.column >= opens ? cell.column + 1 : cell.column];
        const row = cell && grid.rows[cell.row];
        return column && row ? [{ x: column.centre, y: row.centre }] : [];
      });
      // A wire between neighbouring columns has no cell to go through.
      const span = Math.abs((column.get(edge.target) ?? 0) - (column.get(edge.source) ?? 0));
      return { ...drawnWire(edge, selected, reads), type: 'routed', data: { points, lit: selected.has(edge.source) || selected.has(edge.target), routable: span > 1 } };
    });
    // `sized` stands for the sizes the grid is worked out from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfEdges, lit, table, opens, pulling, sized]);

  // A card in the hand is drawn pulled toward the cell it would land on; the others glide to where the table puts them.
  const aim = useGraphStore((s) => s.aim);
  const documentId = useGraphStore((s) => s.document);
  const hand = useMemo(() => {
    if (!aim?.target || aim.id === NEW) return null;
    const sizes = sizesOf(nodesOf(useGraphStore.getState()));
    const grid = gridOf(table, sizes, { column: aim.opens, row: true });
    const column = grid.cols[aim.target.column];
    const row = grid.rows[aim.target.r];
    return column && row ? { id: aim.id, ...topLeft({ x: column.centre, y: row.centre }, sizes.get(aim.id)) } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aim, table, sized]);
  const shown = useGlide(rfNodes, documentId, hand);

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [rfInstance, setRfInstance] = React.useState<ReactFlowInstance | null>(null);

  // What the view owes (`viewDue`): another graph fitted whole; a node added
  // shown with the rest where they fit readably.
  // Paid once the canvas is on screen and what it is about is measured, at the
  // canvas's own size as it is then: a fit on a timer ran before the node was
  // measured, and did nothing -- a palette node stayed out of sight, and New
  // kept the last graph's view.
  const documentOpen = useGraphStore((s) => s.document);
  const minZoom = useStore((s) => s.minZoom);
  const due = useRef<ViewDue>({ document: documentOpen, count: rfNodes.length, fit: false, show: null, added: false });
  React.useEffect(() => {
    due.current = viewDue(due.current, { document: documentOpen, ids: rfNodes.map((node) => node.id) });
    const owed = due.current;
    const wrapper = reactFlowWrapper.current;
    if (!rfInstance || !wrapper || !active || !wrapper.clientWidth || !wrapper.clientHeight) return;
    const measured = (node: { width?: number | null; height?: number | null }) => !!node.width && !!node.height;
    if (owed.fit) {
      const nodes = rfInstance.getNodes();
      if (!nodes.every(measured)) return;
      // An empty graph starts where the first node goes (`placement`) is in sight.
      rfInstance.setViewport(nodes.length
        ? getViewportForBounds(getNodesBounds(nodes), wrapper.clientWidth, wrapper.clientHeight, minZoom, 1, 0.25)
        : { x: 0, y: 0, zoom: 1 });
      owed.fit = false;
      owed.show = null;
      return;
    }
    if (!owed.show) return;
    const node = rfInstance.getNode(owed.show);
    if (node && !measured(node)) return;
    const added = owed.added;
    owed.show = null;
    owed.added = false;
    if (!node) return;
    const { x, y, zoom } = rfInstance.getViewport();
    const view = { x: 0, y: 0, width: wrapper.clientWidth, height: wrapper.clientHeight };
    const onScreen = (one: typeof node) => {
      const at = one.positionAbsolute ?? one.position;
      return { x: at.x * zoom + x, y: at.y * zoom + y, width: (one.width ?? 0) * zoom, height: (one.height ?? 0) * zoom };
    };
    // A node added: the whole graph where it fits, never zoomed in, and still
    // readable -- else the new node alone, by as little as that takes.
    if (added) {
      const nodes = rfInstance.getNodes();
      if (nodes.every(measured)) {
        if (allInView(nodes.map(onScreen), view)) return;
        const whole = getViewportForBounds(getNodesBounds(nodes), view.width, view.height, minZoom, Math.min(zoom, 1), 0.1);
        if (whole.zoom >= READABLE_ZOOM) {
          rfInstance.setViewport(whole, { duration: 250 });
          return;
        }
      }
    }
    const { dx, dy } = panToShow(onScreen(node), view);
    if (dx || dy) rfInstance.setViewport({ x: x + dx, y: y + dy, zoom }, { duration: 250 });
  }, [rfNodes, rfInstance, active, documentOpen, minZoom]);
  // A column that opened, or a card made bigger, can push what is after it out of sight: once the cards have
  // settled, the view takes it in again where that still reads (as for a node added).
  // Only for a table that is new to the view: coming back to the canvas after another tab is not a reason to move what was left where it was.
  const tableKey = useGraphStore((s) => JSON.stringify(s.table));
  const seenTable = useRef(tableKey);
  React.useEffect(() => {
    const wrapper = reactFlowWrapper.current;
    if (!rfInstance || !wrapper || !active || seenTable.current === tableKey) return undefined;
    const timer = window.setTimeout(() => {
      seenTable.current = tableKey;
      const nodes = rfInstance.getNodes();
      if (!nodes.length || !nodes.every((node) => !!node.width && !!node.height)) return;
      const { x, y, zoom } = rfInstance.getViewport();
      const view = { x: 0, y: 0, width: wrapper.clientWidth, height: wrapper.clientHeight };
      const seen = nodes.map((node) => {
        const at = node.positionAbsolute ?? node.position;
        return { x: at.x * zoom + x, y: at.y * zoom + y, width: (node.width ?? 0) * zoom, height: (node.height ?? 0) * zoom };
      });
      if (allInView(seen, view)) return;
      const whole = getViewportForBounds(getNodesBounds(nodes), view.width, view.height, minZoom, Math.min(zoom, 1), 0.1);
      if (whole.zoom >= READABLE_ZOOM) rfInstance.setViewport(whole, { duration: 250 });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [tableKey, rfInstance, active, minZoom]);
  // The map of the whole graph, only where the canvas has room for it beside
  // what it maps: in a narrow window it covered a third of it.
  const roomy = useStore((s) => s.width >= 640);

  // The wire itself is the store's to make (`connect`): a canvas is one way
  // to ask for one, and a test is another.
  const onConnect = useCallback((params: Connection) => {
    if (!params.source || !params.target || !params.sourceHandle || !params.targetHandle) return;
    wired.current = true;
    connect({ source: params.source, sourceHandle: params.sourceHandle, target: params.target, targetHandle: params.targetHandle });
  }, [connect]);

  // A wire let go over a node rather than over one of its dots: a new input
  // there, named after what arrives (`connectToNewInput`). Before, it was
  // dropped, and a second input meant the node's Advanced and "+ input" first.
  const started = useRef<OnConnectStartParams | null>(null);
  const wired = useRef(false);
  const onConnectStart = useCallback((_: unknown, params: OnConnectStartParams) => {
    started.current = params;
    wired.current = false;
  }, []);
  // The node a wire let go on empty canvas is to lead to: where it was let go, and what it came from.
  const [next, setNext] = React.useState<{
    at: { x: number; y: number };
    position: { x: number; y: number };
    from: { source: string; sourceHandle: string };
    hint?: string;
  } | null>(null);
  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent) => {
    const start = started.current;
    started.current = null;
    if (!start?.nodeId || !start.handleId || start.handleType !== 'source' || wired.current) return;
    const point = 'changedTouches' in event ? event.changedTouches[0] : event;
    const under = document.elementFromPoint(point.clientX, point.clientY);
    const target = under?.closest('.react-flow__node')?.getAttribute('data-id');
    if (target) {
      useGraphStore.getState().connectToNewInput({ source: start.nodeId, sourceHandle: start.handleId, target });
      return;
    }
    // Let go on empty canvas: which node comes next is asked there.
    const wrapper = reactFlowWrapper.current;
    if (!under?.closest('.react-flow__pane') || !wrapper || !rfInstance) return;
    const bounds = wrapper.getBoundingClientRect();
    const at = { x: point.clientX - bounds.left, y: point.clientY - bounds.top };
    const { rfNodes: nodes } = useGraphStore.getState();
    const from = nodes.find((node) => node.id === start.nodeId)?.data.graphNode;
    const port = from?.outputs.find((one) => one.id === start.handleId);
    setNext({
      at,
      position: rfInstance.project(at),
      from: { source: start.nodeId, sourceHandle: start.handleId },
      hint: from && port ? `Adds it, wired to ${port.name} of ${from.label}` : undefined,
    });
  }, [rfInstance]);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (!reactFlowWrapper.current || !rfInstance) return;

      // Only node types are dropped. A block is put on the GUI, on the GUI
      // tab, so nothing drops a widget onto a canvas.
      const nodeType = event.dataTransfer.getData('application/nodeType') as NodeType;
      if (!nodeType) return;

      // Where it is let go: the cell it is pulled to, a column of its own between two columns. Aimed once more
      // here -- a drop need not follow a drag-over at the same spot, and a node would land where it was last held.
      useGraphStore.getState().aimCard(NEW, rfInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
      const held = useGraphStore.getState().aim;
      const at = held?.id === NEW && held.target
        ? held.target
        : rfInstance.screenToFlowPosition({ x: event.clientX - CARD.width / 2, y: event.clientY - CARD.height / 2 });
      // Chosen, as a palette click adds one.
      useGraphStore.getState().addNode(nodeType, at);
    },
    [rfInstance]
  );

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    // A node from the palette is held like a card: the cell it would land on lights up.
    if (rfInstance && event.dataTransfer.types.includes('application/nodetype')) {
      useGraphStore.getState().aimCard(NEW, rfInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    }
  }, [rfInstance]);

  const onDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) useGraphStore.getState().clearAim();
  }, []);

  return (
    // Focusable, so a click on the empty canvas puts the keys here: Delete
    // deletes what is selected only when it was pressed on the canvas
    // (`deletes`), without asking: Ctrl+Z puts it back.
    <div
      ref={reactFlowWrapper}
      className="relative flex-1 min-h-0 outline-none"
      tabIndex={-1}
      onKeyDown={(event) => {
        // A key typed into a field -- the search a wire opens -- is the field's, not the canvas's.
        const typing = (event.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]');
        if (!typing && deletes(event.key, active)) deleteSelected();
        // Enter on a focused card opens it, as a double-click does. Not left to type
        // itself into the view's first box, which takes the keyboard as it opens.
        const card = (event.target as HTMLElement).closest?.<HTMLElement>('.react-flow__node');
        if (event.key === 'Enter' && active && card && card === event.target && card.dataset.id) {
          event.preventDefault();
          setEditingNode(card.dataset.id);
        }
      }}
    >
      <ReactFlow
        nodes={shown}
        edges={edges}
        edgeTypes={edgeTypes}
        // The canvas stays mounted, hidden, while a node or the GUI is open: it has no size then, which
        // React Flow warns of (004) at every visit -- known and meant, so not said; anything else is.
        onError={(code, message) => { if (code !== '004') console.warn(message); }}
        // A drag reports a position change per frame, so its undo step comes
        // from dropCard instead, when it changes the table. Nothing is removed through here: the
        // canvas's Delete is its own (`deleteKeyCode` below). Applied to the
        // nodes as they are now, not as the last drawing had them: the cards
        // that slide over while one is held are moved meanwhile.
        onNodesChange={(changes: NodeChange[]) => setRFNodes(applyNodeChanges(changes, useGraphStore.getState().rfNodes) as typeof rfNodes)}
        // Held, a card is pulled toward the cell it would land on, and the space between two columns opens a column for it;
        // let go, it is put there as one change of the table. Dragged along with others it only springs back.
        onNodeDrag={(_, node, dragged) => {
          if (dragged.length > 1) return;
          const size = sizesOf(nodesOf(useGraphStore.getState())).get(node.id) ?? { width: CARD.width, height: CARD.height };
          useGraphStore.getState().aimCard(node.id, { x: node.position.x + size.width / 2, y: node.position.y + size.height / 2 });
        }}
        onNodeDragStop={(_, node, dragged) => {
          const size = sizesOf(nodesOf(useGraphStore.getState())).get(node.id) ?? { width: CARD.width, height: CARD.height };
          if (dragged.length > 1) useGraphStore.getState().springBack();
          else {
            // The last place it was moved to counts, whether or not a move of it was reported since.
            useGraphStore.getState().aimCard(node.id, { x: node.position.x + size.width / 2, y: node.position.y + size.height / 2 });
            useGraphStore.getState().dropCard(node.id);
          }
        }}
        // Cards chosen together, dragged by the frame round them, are not put anywhere by hand: back to their cells.
        onSelectionDragStop={() => useGraphStore.getState().springBack()}
        // A drag begins once the node moves, not when the button goes down:
        // at ReactFlow's 0 every click on a node began one.
        nodeDragThreshold={1}
        // ReactFlow's arrow keys moved a chosen card five pixels off its cell, with no drop to put it back: a card is moved by the table.
        // Enter opens a card (above); nothing else of ReactFlow's keys is wanted.
        disableKeyboardA11y
        onEdgesChange={(changes: EdgeChange[]) => setRFEdges(applyEdgeChanges(changes, rfEdges))}
        onConnect={onConnect}
        // Not to itself: a node's output into its own input waits on itself.
        isValidConnection={(wire) => wire.source !== wire.target}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        // A click chooses a node (ReactFlow does that itself), to move or
        // delete; a double-click opens it where the canvas was.
        onNodeDoubleClick={(_, node) => setEditingNode(node.id)}
        onPaneClick={clearSelection}
        nodeTypes={nodeTypes}
        fitView
        // Fit, but never magnify: a small graph fitted would open at ~180%, its
        // node text half again the size of the panel text beside it. 100% is
        // the honest starting point -- one type size across the whole window --
        // and a graph too big for the viewport is still shrunk to fit.
        fitViewOptions={{ maxZoom: 1, padding: 0.25 }}
        // ReactFlow's 0.5 held a graph of fifteen nodes in a row at twice the
        // canvas's width: a wire is drawn only between two ends in sight.
        minZoom={0.2}
        onInit={setRfInstance}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        // ReactFlow's Delete took a node's wires before it asked about the
        // node, one undo step each: the wrapper above handles the key instead.
        deleteKeyCode={null}
        // ReactFlow's Space, held to pan, cancels the click of every button the
        // keyboard presses with it -- on the node view and the bars as much as here.
        panActivationKeyCode={null}
        style={{ background: SUNKEN }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={22}
          size={1.6}
          color={LINE}
        />
        <ScheduleLayer />
        <Panel position="top-right">
          <ThinOut />
        </Panel>
        <Controls
          style={PANEL}
        />
        {roomy && (
          <MiniMap
            style={PANEL}
            // The minimap paints SVG `fill` attributes, where a CSS variable does
            // not resolve, so it takes the inks of the editor's scheme as values.
            nodeColor={(node) => scheme(editorScheme).ink[node.data?.graphNode?.node_type as NodeType] ?? SURFACE}
          />
        )}
      </ReactFlow>
      {next && (
        <QuickPick
          entries={PICKABLE}
          keyOf={(entry) => entry.type}
          onPick={(entry) => {
            useGraphStore.getState().addNodeFrom(entry.type, next.position, next.from);
            setNext(null);
          }}
          onClose={() => setNext(null)}
          label="Search nodes"
          placeholder="Add a node… code, ai, data"
          footer={next.hint}
          style={{
            position: 'absolute', zIndex: 10,
            left: Math.max(8, Math.min(next.at.x, (reactFlowWrapper.current?.clientWidth ?? 800) - 296)),
            top: Math.max(8, Math.min(next.at.y, (reactFlowWrapper.current?.clientHeight ?? 600) - 330)),
          }}
        />
      )}
      {!rfNodes.length && (
        <p className="pointer-events-none absolute inset-x-0 top-1/3 mx-auto w-fit max-w-sm rounded-xl px-5 py-4 text-center text-sm" style={{ ...PANEL, color: MUTED }}>
          Add a start point from the left, or say what the tool should do in the bar below.
        </p>
      )}
    </div>
  );
}
