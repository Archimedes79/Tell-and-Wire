import React, { useRef, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow, useStore, type EdgeProps } from 'reactflow';
import { useGraphStore } from '../../document/store/graphStore';
import { ACCENT, SURFACE } from '../../../deployment/gui/kit/ui/theme';

export interface Route {
  /** The centres of the cells the wire is drawn through, from its source to its target. */
  points: { x: number; y: number }[];
  /** The wire touches the card that is chosen: its handle is shown. */
  lit: boolean;
  /** There is a column between its ends, so a cell it could be drawn through. */
  routable: boolean;
}

/**
 * The path of a wire from (*sx*, *sy*) to (*tx*, *ty*) through *points*: each stretch leaves and arrives level, as a
 * wire does that goes straight from card to card, so the whole is a smooth S through every cell.
 */
function pathThrough(sx: number, sy: number, tx: number, ty: number, points: Route['points']): string {
  const all = [{ x: sx, y: sy }, ...points, { x: tx, y: ty }];
  let d = `M${sx},${sy}`;
  for (let i = 1; i < all.length; i++) {
    const a = all[i - 1];
    const b = all[i];
    const reach = Math.max(Math.abs(b.x - a.x) * 0.5, 30);
    d += ` C${a.x + reach},${a.y} ${b.x - reach},${b.y} ${b.x},${b.y}`;
  }
  return d;
}

/**
 * A wire that goes back -- a memory's, read round a loop -- leaves its card to the right, runs under both cards and
 * comes in from the left: the way a loop is drawn, instead of a line through the cards between.
 */
function loopUnder(sx: number, sy: number, tx: number, ty: number, lane: number): string {
  const r = 14;
  const x1 = sx + 26;
  const x2 = tx - 26;
  return `M${sx},${sy} H${x1 - r} Q${x1},${sy} ${x1},${sy + r} V${lane - r} Q${x1},${lane} ${x1 - r},${lane} H${x2 + r} Q${x2},${lane} ${x2},${lane - r} V${ty + r} Q${x2},${ty} ${x2 + r},${ty} H${tx}`;
}

/**
 * A wire: the soft curve the canvas has always drawn, or -- when it was routed -- the curve through the cells
 * it is drawn through. The wire itself, or its handle on its middle or on the cell it goes through, is pulled to
 * another cell to route it round the cards; a double-click on the handle takes the route off.
 */
export default function RoutedEdge(props: EdgeProps<Route>) {
  const { id, source, target, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, selected, data } = props;
  // Under both cards, for a wire that goes back.
  const lane = useStore((s) => Math.max(...[source, target].map((one) => {
    const card = s.nodeInternals.get(one);
    return card ? (card.positionAbsolute?.y ?? card.position.y) + (card.height ?? 0) : 0;
  })) + 36);
  const points = data?.points ?? [];
  const routed = points.length > 0;
  const [hover, setHover] = useState(false);
  const leaving = useRef(0);
  const pulling = useGraphStore((s) => s.pulling?.edge === id);
  const [straight, straightX, straightY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const back = !routed && sourceX > targetX - 12;
  const path = routed ? pathThrough(sourceX, sourceY, targetX, targetY, points) : back ? loopUnder(sourceX, sourceY, targetX, targetY, lane) : straight;
  const handle = routed ? points[Math.floor((points.length - 1) / 2)] : back ? { x: (sourceX + targetX) / 2, y: lane } : { x: straightX, y: straightY };
  const shown = (data?.routable || routed) && (hover || pulling || !!selected || !!data?.lit || routed);
  const over = (on: boolean): void => {
    window.clearTimeout(leaving.current);
    if (on) setHover(true);
    else leaving.current = window.setTimeout(() => setHover(false), 150);
  };
  // A wire with a cell to go through is taken by the wire: a click still selects it, a few pixels of pull route it.
  const grab = usePull(id, 6);
  const grabbable = !!data?.routable || routed;
  return (
    <>
      <g onMouseEnter={() => over(true)} onMouseLeave={() => over(false)} onPointerDown={grabbable ? grab : undefined} style={grabbable ? { cursor: 'grab' } : undefined}>
        <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} interactionWidth={22} />
      </g>
      <EdgeLabelRenderer>
        <Handle edge={id} x={handle.x} y={handle.y} shown={shown} routed={routed} onOver={over} />
      </EdgeLabelRenderer>
    </>
  );
}

/**
 * What the pointer going down on wire *edge* does: pulls it toward the cells it may go through, until the button is
 * let go (it is routed there) or Escape is pressed (it stays). From its dot at once (*after* 0); from the wire
 * itself once the pointer has moved *after* pixels -- until then it is a click, and selects the wire.
 */
function usePull(edge: string, after: number): (event: React.PointerEvent) => void {
  const { screenToFlowPosition } = useReactFlow();
  return (event) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    const at = (e: { clientX: number; clientY: number }) => screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const from = { x: event.clientX, y: event.clientY };
    let pulled = false;
    const move = (e: { clientX: number; clientY: number }): void => {
      if (!pulled && Math.hypot(e.clientX - from.x, e.clientY - from.y) < after) return;
      pulled = true;
      useGraphStore.getState().pullWire(edge, at(e));
    };
    const end = (apply: boolean) => (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', key);
      if (pulled) useGraphStore.getState().endPull(apply);
    };
    const up = end(true);
    const key = (e: KeyboardEvent): void => { if (e.key === 'Escape') end(false)(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', key);
    if (after === 0) move(event);
  };
}

/** The dot on a wire that is pulled. */
function Handle({ edge, x, y, shown, routed, onOver }: { edge: string; x: number; y: number; shown: boolean; routed: boolean; onOver: (on: boolean) => void }) {
  const pull = usePull(edge, 0);
  return (
    <div
      className="nodrag nopan"
      role="button"
      tabIndex={-1}
      aria-label={routed ? 'Pull this wire to another cell, or double-click to straighten it' : 'Pull this wire to a cell to route it round the cards'}
      title={routed ? 'Pull to another cell. Double-click: the straight way' : 'Pull the wire to a cell to route it round the cards'}
      onPointerDown={pull}
      onDoubleClick={() => useGraphStore.getState().routeWire(edge, null)}
      onMouseEnter={() => onOver(true)}
      onMouseLeave={() => onOver(false)}
      style={{
        position: 'absolute', transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`, pointerEvents: shown ? 'all' : 'none',
        width: 14, height: 14, borderRadius: '50%', boxSizing: 'border-box', cursor: 'grab',
        background: routed ? ACCENT : SURFACE, border: `2px solid ${ACCENT}`, opacity: shown ? 1 : 0, transition: 'opacity 0.12s',
      }}
    />
  );
}
