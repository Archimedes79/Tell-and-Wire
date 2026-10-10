import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Handle, Position, NodeProps, useStore, useUpdateNodeInternals } from 'reactflow';
import type { RFNodeData } from '../../app/store/nodeData';
import type { GraphNode, GuiWidget, NodeResult, Port } from '../../app/graph';
import { takesNewInputs, useGraphStore } from '../../app/store/graphStore';
import { NODE_BUILDERS } from '../../app/elements/registry';
import { errorLine, portPreviews } from '../../app/elements/resultPreview';
import { ACCENT, ACCENT_GLOW, DANGER, DIM, EVENT, HOVER, LINE, MUTED, SUCCESS, SUNKEN, SURFACE, TEXT, WARNING } from '../../app/ui/theme';
import { cut } from '../../app/ui/cut';
import { hasOutputs, statusTone } from '../../app/store/executionStatus';
import { blocksAt } from '../../app/document/page';
import { registry as runnerRegistry } from '../../../graph/nodes/registry.ts';
import { carriesFiles, dropExample, droppedFile } from '../authoring/droppedFile';
import { errorText } from '../../app/api/errorText';
import { RUN_PORT } from '../../../graph/execution/triggers.ts';
import ResultPreview, { ErrorPreview } from './ResultPreview';
import Button from '../../app/ui/Button';
import { useIsWriting } from '../authoring/useGenerate';

// Colour AND a glyph: a red/green 8px dot is unreadable both to a screen
// reader and to a colour-blind user scanning a canvas for the failed node.
// One for every status a run reports, so none goes without a dot.
const statusStyles: Record<NodeResult['status'] | 'held', { color: string; glyph: string; title: string }> = {
  success: { color: SUCCESS, glyph: '✓', title: 'Succeeded' },
  // Delivered, with items lost: the warning colour, as in the node view's last run.
  partial: { color: WARNING, glyph: '◐', title: 'Some items failed; the others delivered' },
  error: { color: DANGER, glyph: '!', title: 'Failed' },
  // Something it needs failed, the run was stopped, or its ◆ stayed shut.
  skipped: { color: DIM, glyph: '–', title: 'Did not run' },
  // Did not run this time: its ◆ stayed shut, and what it made before stands.
  held: { color: DIM, glyph: '‖', title: 'Did not run: what it made in an earlier run stands' },
};

/**
 * The card is built of fixed rows -- a header, then one row per port -- so a
 * port's dot stands at the middle of its row, beside the name the row says.
 * The names are always on the card: they show what goes in and out without
 * the pointer having to be over it.
 */
const HEADER = 38;
const ROW = 20;
const dotTop = (index: number): number => HEADER + index * ROW + ROW / 2;

/** A port's name on its row: a list is marked ∞, as its dot is a ring. */
const portName = (port: Port): string => `${port.name}${port.multi ? ' ∞' : ''}`;

/**
 * One port, as a dot on the card's edge -- or, for a start point's, where a
 * run begins, the amber diamond an event wears everywhere. The dot is drawn
 * inside a bare handle rather than as it, so the diamond can turn while the
 * name beside it stays level. Its title says what it carries.
 */
function PortDot({ port, type, side, top, lit, fires }: {
  port: Port;
  type: 'source' | 'target';
  side: 'left' | 'right';
  /** Where on the edge, in pixels from the top of the card: the middle of the port's row. */
  top: number;
  /** The card is the one selected: its dots take the accent, as its wires do. */
  lit: boolean;
  fires?: boolean;
}) {
  const colour = lit ? ACCENT : MUTED;
  // A list is a ring: it takes, or hands on, several values.
  // A passive output is a dashed ring: what a wire from it reads, it reads as the round began, and it orders nothing.
  const dot: React.CSSProperties = fires
    ? { background: EVENT, border: `2px solid ${SURFACE}`, borderRadius: 2, transform: 'rotate(45deg)' }
    : port.passive
      ? { background: 'transparent', border: `2px dashed ${colour}`, borderRadius: '50%' }
      : { background: port.multi ? SURFACE : colour, border: `2px solid ${port.multi ? colour : SURFACE}`, borderRadius: '50%' };
  const title = fires
    ? `${port.description || port.name} — a run begins here, at whatever this is wired to.`
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
    </Handle>
  );
}

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
 * A node on the canvas: one card for every kind -- its kind's icon in its
 * colour, its heading, a row for each port with the port's name and its dot on
 * the edge, and below them what it holds or made: after a run how it went and
 * a small picture of what it made, and for a start or end point which blocks of
 * the page connect to it. What it should do is its tooltip; the rest of it is
 * the node view's. A click chooses it, a double-click opens it (the canvas's
 * `onNodeDoubleClick`), and the card chosen wears the accent.
 */
const GraphNodeView = memo(({ id, data, selected }: NodeProps<RFNodeData>) => {
  const { graphNode } = data;
  // ✨ is writing for it, whether or not its view is open.
  const writing = useIsWriting(id);
  const executionResult = useGraphStore((s) =>
    s.executionResult?.node_results.find((r) => r.node_id === id)
  );

  const builder = NODE_BUILDERS[graphNode.node_type];
  const lit = selected;

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
  // Where a run begins: its ports are events, and nothing gates it.
  const events = new Set(runnerRegistry.node(graphNode.node_type)?.eventPorts(graphNode as never) ?? []);
  const connected = useGraphStore((s) => pageLine(graphNode, s.page));
  const summary = builder?.canvasSummary?.(graphNode);
  const Icon = builder?.icon;
  // What it is, for the pointer: its heading, its kind and id, then what it should do.
  const tip = [graphNode.label, `${builder?.label ?? graphNode.node_type} (${graphNode.id})`, graphNode.description.trim()].filter(Boolean).join('\n');
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
  // Nothing to browse for; the node view opens on it (`dropExample`).
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
  // As Delete on the canvas: nothing is asked, and Ctrl+Z puts it back.
  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    useGraphStore.getState().deleteNodes([id]);
  }, [id]);

  // A wire on its way from another node's output: where dropping it on the
  // card makes a new input (`connectToNewInput`), the card says so -- nothing
  // else told that a code or AI node takes one there and other nodes do not.
  const wireComing = useStore((s) => s.connectionHandleType === 'source' && !!s.connectionNodeId && s.connectionNodeId !== id);
  const takesWire = wireComing && takesNewInputs(graphNode);

  const failedDrop = statusTone('error');
  const rows = Math.max(graphNode.inputs.length, graphNode.outputs.length);
  const hasFoot = !!connected || summary !== undefined || shown.length > 0 || !!failure || takesWire || !!dropFailed;

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
        minWidth: 200, maxWidth: 260,
      }}
    >
      {/* The run port: every node has it and no node declares it. A start
          point is the one kind that does not -- it is where runs begin,
          not where they go. */}
      {!events.size && (
        <Handle
          type="target"
          position={Position.Top}
          id={RUN_PORT}
          title="Start here. Wire a start point to this, and the run it begins goes from this node on. It carries no value."
          style={{ width: 12, height: 12, top: -7, left: 18, transform: 'none', background: 'transparent', border: 'none', borderRadius: 0 }}
        >
          <span
            className="absolute pointer-events-none"
            style={{ inset: 1, background: EVENT, border: `2px solid ${SUNKEN}`, borderRadius: 2, transform: 'rotate(45deg)' }}
          />
        </Handle>
      )}

      <div className="flex items-center gap-2 px-3.5 min-w-0" style={{ height: HEADER }}>
        {Icon && <Icon size={16} strokeWidth={2} aria-hidden="true" className="shrink-0" style={{ color: builder.ink }} />}
        <span className="flex-1 min-w-0 truncate text-sm font-semibold" style={{ color: TEXT }} title={tip}>
          {graphNode.label}
        </span>
        {writing && (
          <span className="shrink-0 text-xs animate-pulse" role="img" aria-label="✨ is writing for this node" title="✨ is writing for this node">✨</span>
        )}
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
        <Button
          variant="danger"
          size="sm"
          onClick={handleDelete}
          className={`nodrag shrink-0 -mr-1.5 transition-opacity group-hover:opacity-100 focus:opacity-100 ${lit ? 'opacity-100' : 'opacity-0'}`}
          title="Delete node"
          aria-label={`Delete node ${graphNode.label}`}
        >
          <Trash2 size={14} aria-hidden="true" />
        </Button>
      </div>

      {/* A row per port: what goes in on the left, what comes out on the right. */}
      {rows > 0 && (
        <div style={{ paddingBottom: 6 }}>
          {Array.from({ length: rows }, (_, index) => (
            <div key={index} className="flex items-center justify-between gap-3 px-3.5 text-xs" style={{ height: ROW, color: MUTED }}>
              <span className="min-w-0 truncate">{graphNode.inputs[index] && portName(graphNode.inputs[index])}</span>
              <span className="min-w-0 truncate text-right">{graphNode.outputs[index] && portName(graphNode.outputs[index])}</span>
            </div>
          ))}
        </div>
      )}

      {hasFoot && (
        <div className="flex flex-col gap-1 px-3.5 py-2.5 min-w-0" style={{ borderTop: `1px solid ${LINE}` }}>
          {/* Which blocks of the page fire it, send to it or show it. */}
          {connected && (
            <div className="truncate text-xs" style={{ color: MUTED }} title={connected}>
              {connected}
            </div>
          )}

          {/* What the node holds, when its element says: a data node's value, the
              folder a folder node lists, where an end point writes, who starts a
              start point. */}
          {summary !== undefined && (
            <div
              className="truncate rounded px-1 py-0.5 font-mono text-xs"
              style={{ background: HOVER, color: MUTED }}
              title={summary}
            >
              {cut(summary, 30)}
            </div>
          )}

          {shown.map(([port, preview]) => (
            <div key={port.id} className="flex min-w-0 flex-col gap-0.5">
              {shown.length > 1 && <span className="text-[10px]" style={{ color: DIM }}>{port.name}</span>}
              <ResultPreview preview={preview!} status={executionResult?.status} held={held} />
            </div>
          ))}
          {failure}
          {takesWire && (
            <div className="rounded px-1 py-0.5 text-xs" style={{ background: HOVER, color: ACCENT }}>
              Drop the wire here for a new input
            </div>
          )}
          {/* A file dropped here that could not become its example, and why --
              whole, since it says what to do instead. */}
          {dropFailed && (
            <div className="rounded px-1 py-0.5 text-xs" style={{ background: failedDrop.bg, color: failedDrop.fg }}>
              {dropFailed}
            </div>
          )}
        </div>
      )}

      {graphNode.inputs.map((port, index) => (
        <PortDot key={`in:${port.id}`} port={port} type="target" side="left" top={dotTop(index)} lit={lit} />
      ))}
      {graphNode.outputs.map((port, index) => (
        <PortDot key={`out:${port.id}`} port={port} type="source" side="right" top={dotTop(index)} lit={lit} fires={events.has(port.id)} />
      ))}
    </div>
  );
});

GraphNodeView.displayName = 'GraphNodeView';

export default GraphNodeView;
