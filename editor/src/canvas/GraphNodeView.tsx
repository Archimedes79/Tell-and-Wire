import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Handle, Position, NodeProps, useStore, useUpdateNodeInternals } from 'reactflow';
import type { RFNodeData } from '@/store/nodeData';
import type { GraphNode, GuiWidget, NodeResult, Port } from '@/graph';
import { takesNewInputs, useGraphStore } from '@/store/graphStore';
import { NODE_BUILDERS } from '@/elements/registry';
import { errorLine, portPreviews } from '@/elements/resultPreview';
import { ACCENT, ACCENT_GLOW, DANGER, DIM, EVENT, HOVER, LINE, MUTED, SUCCESS, SUNKEN, SURFACE, TEXT } from '@/ui/theme';
import { cut } from '@/ui/cut';
import { hasOutputs, statusTone } from '@/store/executionStatus';
import { blocksAt } from '@/document/page';
import { firstLine } from '@/document/heading';
import { registry as engineRegistry } from '@engine/elements/registry.ts';
import { carriesFiles, dropExample, droppedFile } from '@/authoring/droppedFile';
import { errorText } from '@/api/errorText';
import { RUN_PORT } from '@engine/execution/triggers.ts';
import ResultPreview, { ErrorPreview } from './ResultPreview';
import NodeKind from './NodeKind';
import { askToDelete } from './nodeRemoval';

// Colour AND a glyph: a red/green 8px dot is unreadable both to a screen
// reader and to a colour-blind user scanning a canvas for the failed node.
// One for every status a run reports, so none goes without a dot.
const statusStyles: Record<NodeResult['status'] | 'held', { color: string; glyph: string; title: string }> = {
  success: { color: SUCCESS, glyph: '✓', title: 'Succeeded' },
  // Delivered, with items lost: amber, as in the results panel.
  partial: { color: '#f59e0b', glyph: '◐', title: 'Some items failed; the others delivered' },
  error: { color: DANGER, glyph: '!', title: 'Failed' },
  // Something it needs failed, the run was stopped, or its ◆ stayed shut.
  skipped: { color: '#6b7280', glyph: '–', title: 'Did not run' },
  // Did not run this round: its ◆ stayed shut, and what it made before stands.
  held: { color: '#6b7280', glyph: '‖', title: 'Did not run this round: what it produced in an earlier round stands' },
};

/**
 * One port, as a dot on the card's edge -- or, for a start point's, where a
 * round begins, the amber diamond an event wears everywhere. The dot is drawn
 * inside a bare handle rather than as it, so the diamond can turn while the
 * name beside it stays level. The name shows while the card is under the
 * pointer -- which is while a wire is being dragged to it -- and is always the
 * handle's title.
 */
function PortDot({ port, type, side, top, lit, fires }: {
  port: Port;
  type: 'source' | 'target';
  side: 'left' | 'right';
  /** Where on the edge, from the top of what holds it. */
  top: string | number;
  /** The card is the one selected: its dots take the accent, as its wires do. */
  lit: boolean;
  fires?: boolean;
}) {
  const colour = lit ? ACCENT : MUTED;
  // A list is a ring: it takes, or hands on, several values.
  const dot: React.CSSProperties = fires
    ? { background: EVENT, border: `2px solid ${SURFACE}`, borderRadius: 2, transform: 'rotate(45deg)' }
    : { background: port.multi ? SURFACE : colour, border: `2px solid ${port.multi ? colour : SURFACE}`, borderRadius: '50%' };
  const title = fires
    ? `${port.description || port.name} — a round begins here, at whatever this is wired to.`
    : `${port.description || port.name}${port.multi ? ' (a list)' : ''}`;
  return (
    <Handle
      type={type}
      position={side === 'left' ? Position.Left : Position.Right}
      id={port.id}
      title={title}
      style={{ width: 12, height: 12, top, [side]: -7, background: 'transparent', border: 'none', borderRadius: 0 }}
    >
      <span className="absolute pointer-events-none" style={{ inset: 1, ...dot }} />
      <span
        className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] leading-4 pointer-events-none opacity-0 transition-opacity group-hover:opacity-100"
        style={{ [side === 'left' ? 'right' : 'left']: 16, background: SURFACE, border: `1px solid ${LINE}`, color: TEXT }}
      >
        {port.name}{port.multi && ' ∞'}
      </span>
    </Handle>
  );
}

/** Where each of *count* dots stands on an edge: spread evenly down it, one alone in the middle. */
const spread = (index: number, count: number): string => `${((index + 1) / (count + 1)) * 100}%`;

/** The blocks *blocks* name, by their labels: "Go, Length". */
const labelsOf = (blocks: GuiWidget[]): string => blocks.map((block) => block.label || block.id).join(', ');

/**
 * What the page says of a start or an end point, in a line: which blocks fire
 * it and send to it, or show it -- what the card cannot otherwise show, since
 * nothing is wired between the page and the graph.
 */
function pageLine(node: GraphNode, page: GuiWidget[]): string | undefined {
  const { fire, send, show } = blocksAt(page, node.id);
  const said = [
    fire.length ? `⚡ ${labelsOf(fire)}` : '',
    send.length ? `sent ${labelsOf(send)}` : '',
    show.length ? `shown on ${labelsOf(show)}` : '',
  ].filter(Boolean);
  return said.length ? said.join(' · ') : undefined;
}

/**
 * A node on the canvas: a card that says what it is -- its kind in its kind's
 * tint, its id, its heading and the first line of what it should do -- and,
 * after a run, how it went and a small picture of what it made. Its ports are
 * dots on its edges, and a start or end point says which blocks of the page
 * connect to it. Clicking it opens its panel beside the canvas (the canvas's
 * `onNodeClick`), and the card with its panel open wears the accent.
 */
const GraphNodeView = memo(({ id, data, selected }: NodeProps<RFNodeData>) => {
  const { graphNode } = data;
  const open = useGraphStore((s) => s.editingNodeId === id);
  const executionResult = useGraphStore((s) =>
    s.executionResult?.node_results.find((r) => r.node_id === id)
  );

  const builder = NODE_BUILDERS[graphNode.node_type];
  const lit = selected || open;

  // ReactFlow finds a wire's ends by the handles it measured when the card was
  // drawn: a port renamed on a card that kept its size was a handle it did not
  // know, and the wire, still in the graph, was not drawn. Measured again when
  // the ports change.
  const updateNodeInternals = useUpdateNodeInternals();
  const handles = `${graphNode.inputs.map((port) => port.id).join(',')}|${graphNode.outputs.map((port) => port.id).join(',')}`;
  const measuredHandles = useRef(handles);
  useEffect(() => {
    if (measuredHandles.current === handles) return;
    measuredHandles.current = handles;
    updateNodeInternals(id);
  }, [id, handles, updateNodeInternals]);
  const status = executionResult ? statusStyles[executionResult.held ? 'held' : executionResult.status] : undefined;
  // A node that did not run says why, when the run said -- one that stood
  // still with what it made before, too.
  const statusTitle = executionResult?.status === 'skipped'
    ? executionResult.messages?.[0] ?? status?.title
    : status?.title;
  // Where a round begins: its ports are events, and nothing gates it.
  const events = new Set(engineRegistry.node(graphNode.node_type)?.eventPorts(graphNode as never) ?? []);
  const connected = useGraphStore((s) => pageLine(graphNode, s.page));
  const summary = builder?.canvasSummary?.(graphNode);
  // Its text's first line, which is what a card has room for: the rest is the panel's.
  const said = firstLine(graphNode.description);
  // What it made last, beside the port each value stands at, read by its
  // shape. Faded while it stood still.
  const previews = executionResult && hasOutputs(executionResult)
    ? portPreviews(graphNode, executionResult) : undefined;
  const held = executionResult?.held;
  const failure = executionResult?.status === 'error'
    ? <ErrorPreview line={errorLine(executionResult.error)} error={executionResult.error ?? ''} />
    : null;
  // Under the card, each value by the port it stands at -- named, when there is more than one to tell apart.
  const shown = previews
    ? [...graphNode.inputs.map((port) => [port, previews.inputs[port.id]] as const),
      ...graphNode.outputs.map((port) => [port, previews.outputs[port.id]] as const)].filter(([, preview]) => preview)
    : [];

  // A file dropped on a node fills what the element says (`dropPort`): a
  // file a code or ai node's ✨ Input writes from, what a data node holds.
  // Nothing to browse for; its own panel opens on it (`dropExample`).
  const dropInto = builder?.dropPort(graphNode);
  const [fileOver, setFileOver] = useState(false);
  const [dropFailed, setDropFailed] = useState('');
  const onDragOver = useCallback((event: React.DragEvent) => {
    if (!dropInto || !carriesFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    setFileOver(true);
  }, [dropInto]);
  const onDrop = useCallback((event: React.DragEvent) => {
    setFileOver(false);
    const file = dropInto ? droppedFile(event.dataTransfer) : undefined;
    if (!file || !dropInto) return;
    // Not the canvas's, and not the window's: this drop is not a graph to open.
    event.preventDefault();
    event.stopPropagation();
    setDropFailed('');
    dropExample(id, dropInto, file).catch((reason) => setDropFailed(errorText(reason, 'The file could not be read.')));
  }, [id, dropInto]);
  // The same question Delete on the canvas asks, when there is one to ask:
  // its wires, what the page connects to it (`askToDelete`).
  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    askToDelete([id], [], window.confirm);
  }, [id]);

  // A wire on its way from another node's output: where dropping it on the
  // card makes a new input (`connectToNewInput`), the card says so -- nothing
  // else told that a code or AI node takes one there and other nodes do not.
  const wireComing = useStore((s) => s.connectionHandleType === 'source' && !!s.connectionNodeId && s.connectionNodeId !== id);
  const takesWire = wireComing && takesNewInputs(graphNode);

  const failedDrop = statusTone('error');
  const ports = Math.max(graphNode.inputs.length, graphNode.outputs.length);

  return (
    <div
      className="group relative flex flex-col rounded-xl select-none"
      onDragOver={onDragOver}
      onDragLeave={() => setFileOver(false)}
      onDrop={onDrop}
      style={{
        background: SURFACE,
        border: `1px ${fileOver || takesWire ? 'dashed' : 'solid'} ${lit || fileOver || takesWire ? ACCENT : LINE}`,
        // The accent, doubled to two pixels without moving anything, and its glow.
        boxShadow: lit ? `0 0 0 1px ${ACCENT}, 0 0 0 6px ${ACCENT_GLOW}` : undefined,
        minWidth: 200, maxWidth: 260, minHeight: ports * 16 + 16,
      }}
    >
      {/* The run port: every node has it and no node declares it. A start
          point is the one kind that does not -- it is where rounds begin,
          not where they go. */}
      {!events.size && (
        <Handle
          type="target"
          position={Position.Top}
          id={RUN_PORT}
          title="Start here. Wire a start point to this, and the round it begins runs the graph from this node on. It carries no value."
          style={{ width: 12, height: 12, top: -7, left: 18, transform: 'none', background: 'transparent', border: 'none', borderRadius: 0 }}
        >
          <span
            className="absolute pointer-events-none"
            style={{ inset: 1, background: EVENT, border: `2px solid ${SUNKEN}`, borderRadius: 2, transform: 'rotate(45deg)' }}
          />
        </Handle>
      )}

      <div className="flex flex-col gap-1 px-3.5 pt-3 pb-3 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <NodeKind node={graphNode} />
          <span className="flex-1" />
          {status && (
            <span
              className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold leading-none shrink-0"
              style={{ background: status.color, color: SUNKEN }}
              role="img"
              aria-label={`Last run: ${statusTitle}`}
              title={statusTitle}
            >
              {status.glyph}
            </span>
          )}
          {/* Out of the way until it is wanted: on the card under the pointer,
              or the one selected. `nodrag`: pressing it does not start a move. */}
          <button
            onClick={handleDelete}
            className={`nodrag shrink-0 rounded px-1 text-xs leading-4 transition-opacity group-hover:opacity-100 focus:opacity-100 ${lit ? 'opacity-100' : 'opacity-0'}`}
            style={{ color: MUTED }}
            title="Delete node"
            aria-label={`Delete node ${graphNode.label}`}
          >
            ✕
          </button>
        </div>
        <div className="truncate text-sm font-semibold" style={{ color: TEXT }} title={graphNode.label}>
          {graphNode.label}
        </div>
        {said && (
          <div className="line-clamp-2 text-xs leading-snug" style={{ color: DIM }} title={graphNode.description}>
            {said}
          </div>
        )}

        {/* Which blocks of the page fire it, send to it or show it. */}
        {connected && (
          <div className="mt-1 truncate text-xs" style={{ color: MUTED }} title={connected}>
            {connected}
          </div>
        )}

        {/* What the node holds, when its element says: a data node's value, the
            folder a folder node lists, where an end point writes, who starts a
            start point. */}
        {summary !== undefined && (
          <div
            className="mt-1 truncate rounded px-1 py-0.5 font-mono text-xs"
            style={{ background: HOVER, color: MUTED }}
            title={summary}
          >
            {cut(summary, 30)}
          </div>
        )}

        {shown.map(([port, preview]) => (
          <div key={port.id} className="mt-1 flex min-w-0 flex-col gap-0.5">
            {shown.length > 1 && <span className="text-[10px]" style={{ color: DIM }}>{port.name}</span>}
            <ResultPreview preview={preview!} status={executionResult?.status} held={held} />
          </div>
        ))}
        {failure && <div className="mt-1">{failure}</div>}
        {takesWire && (
          <div className="mt-1 rounded px-1 py-0.5 text-xs" style={{ background: HOVER, color: ACCENT }}>
            Drop the wire here for a new input
          </div>
        )}
        {/* A file dropped here that could not become its example, and why --
            whole, since it says what to do instead. */}
        {dropFailed && (
          <div className="mt-1 rounded px-1 py-0.5 text-xs" style={{ background: failedDrop.bg, color: failedDrop.fg }}>
            {dropFailed}
          </div>
        )}
      </div>

      {graphNode.inputs.map((port, index) => (
        <PortDot key={`in:${port.id}`} port={port} type="target" side="left" top={spread(index, graphNode.inputs.length)} lit={lit} />
      ))}
      {graphNode.outputs.map((port, index) => (
        <PortDot
          key={`out:${port.id}`} port={port} type="source" side="right" top={spread(index, graphNode.outputs.length)} lit={lit}
          fires={events.has(port.id)}
        />
      ))}
    </div>
  );
});

GraphNodeView.displayName = 'GraphNodeView';

export default GraphNodeView;
