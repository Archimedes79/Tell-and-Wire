import React, { useRef, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow, type EdgeProps } from 'reactflow';
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
 * A wire: the soft curve the canvas has always drawn, or -- when it was routed -- the curve through the cells
 * it is drawn through. Its handle, on the wire's middle or on the cell it goes through, is pulled to
 * another cell to route it round the cards; a double-click on it takes the route off.
 */
export default function RoutedEdge(props: EdgeProps<Route>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, selected, data } = props;
  const points = data?.points ?? [];
  const routed = points.length > 0;
  const [hover, setHover] = useState(false);
  const leaving = useRef(0);
  const pulling = useGraphStore((s) => s.pulling?.edge === id);
  const [straight, straightX, straightY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const path = routed ? pathThrough(sourceX, sourceY, targetX, targetY, points) : straight;
  const handle = routed ? points[Math.floor((points.length - 1) / 2)] : { x: straightX, y: straightY };
  const shown = (data?.routable || routed) && (hover || pulling || !!selected || !!data?.lit || routed);
  const over = (on: boolean): void => {
    window.clearTimeout(leaving.current);
    if (on) setHover(true);
    else leaving.current = window.setTimeout(() => setHover(false), 150);
  };
  return (
    <>
      <g onMouseEnter={() => over(true)} onMouseLeave={() => over(false)}>
        <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} interactionWidth={22} />
      </g>
      <EdgeLabelRenderer>
        <Handle edge={id} x={handle.x} y={handle.y} shown={shown} routed={routed} onOver={over} />
      </EdgeLabelRenderer>
    </>
  );
}

/** The dot on a wire that is pulled. */
function Handle({ edge, x, y, shown, routed, onOver }: { edge: string; x: number; y: number; shown: boolean; routed: boolean; onOver: (on: boolean) => void }) {
  const { screenToFlowPosition } = useReactFlow();
  const pull = (event: React.PointerEvent<HTMLDivElement>): void => {
    event.stopPropagation();
    event.preventDefault();
    const store = useGraphStore.getState();
    const at = (e: { clientX: number; clientY: number }) => screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const move = (e: PointerEvent): void => useGraphStore.getState().pullWire(edge, at(e));
    const end = (apply: boolean) => (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('keydown', key);
      useGraphStore.getState().endPull(apply);
    };
    const up = end(true);
    const key = (e: KeyboardEvent): void => { if (e.key === 'Escape') end(false)(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('keydown', key);
    store.pullWire(edge, at(event.nativeEvent));
  };
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
