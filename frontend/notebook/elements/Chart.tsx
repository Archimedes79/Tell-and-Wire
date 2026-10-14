import { useLayoutEffect, useState } from 'react';

// A chart, drawn here: bars, columns, a line or a donut from `{ kind, title, points: [{ label, value }] }` -- or SVG a step
// wrote, shown as a picture (so nothing in it runs).

interface Point { label: string; value: number }
interface Figure { kind: 'bars' | 'columns' | 'line' | 'donut'; title: string; points: Point[] }

// The notebook's colours, by variable (`notebook.css`), so a chart follows the look the notebook has.
const COLOURS = Array.from({ length: 8 }, (_, at) => `var(--series-${at + 1})`);
const INK = 'var(--ink)', MUTED = 'var(--muted)', AXIS = 'var(--line2)';
const KINDS = ['bars', 'columns', 'line', 'donut'];

const numberOf = (value: unknown): number | null => {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
};

/** A number short enough for a label: 1.4B, 345M, 12k. */
export function short(value: number): string {
  const size = Math.abs(value);
  const [divide, unit] = size >= 1e9 ? [1e9, 'B'] : size >= 1e6 ? [1e6, 'M'] : size >= 1e4 ? [1e3, 'k'] : [1, ''];
  const scaled = value / divide;
  // Under ten thousand a number is as it is (274.4, not 274), to two places; above, it is a short one with its unit.
  if (!unit) return String(Number(value.toFixed(2)));
  return `${Math.abs(scaled) >= 100 || Number.isInteger(scaled) ? Math.round(scaled) : scaled.toFixed(1)}${unit}`;
}

/** How many places apart the names under columns or a line stand, so that none runs into the next: each name needs its letters (at 10 px) and a gap. */
export function labelStep(labels: string[], step: number): number {
  const longest = Math.min(10, Math.max(1, ...labels.map((one) => one.length)));
  return Math.max(1, Math.ceil((longest * 5.8 + 8) / Math.max(1, step)));
}

/**
 * What a step handed on under one name of its own -- `{ figure: { kind, points } }`, a key the page's cell was not called by -- is the thing
 * itself: a chart takes it as it is and says what it takes when it is not one.
 */
export function soleValue(data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const keys = Object.keys(data);
  return keys.length === 1 && !['points', 'values', 'data'].includes(keys[0]) ? soleValue((data as Record<string, unknown>)[keys[0]]) : data;
}

/**
 * One thing of a list as a point: a number, `{ label, value }` or `{ x, y }` -- or a row of one number and its name, `{ word, count }`,
 * which is what a table's row is and so what a step has at hand: the number is the value and the first text the label.
 */
function pointOf(item: unknown, at: number): Point | null {
  const object = item && typeof item === 'object' ? item as Record<string, unknown> : undefined;
  if (!object) {
    const value = numberOf(item);
    return value === null ? null : { label: String(at), value };
  }
  if ('y' in object || 'value' in object) {
    const value = numberOf(object.y ?? object.value);
    return value === null ? null : { label: String(object.x ?? object.label ?? at), value };
  }
  const numbers = Object.values(object).filter((one) => typeof one === 'number');
  if (numbers.length !== 1) return null;
  const name = Object.values(object).find((one) => typeof one === 'string');
  return { label: String(object.x ?? object.label ?? name ?? at), value: numbers[0] as number };
}

/** What arrived at a chart, as a figure: a figure itself, or a list of numbers or of `{ label, value }`. */
export function figureOf(given: unknown): Figure | null {
  const data = soleValue(given);
  const raw = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : null;
  const list = raw ? raw.points : data;
  if (!Array.isArray(list)) return null;
  const points: Point[] = [];
  for (let at = 0; at < list.length; at += 1) {
    const point = pointOf(list[at], at);
    if (!point) return null;
    points.push(point);
  }
  // A model says "pie" as often as "donut", and "bar" for bars.
  const said = String(raw?.kind ?? '').toLowerCase();
  const asked = ({ pie: 'donut', doughnut: 'donut', bar: 'bars', column: 'columns', lines: 'line' } as Record<string, string>)[said] ?? said;
  return { kind: raw && KINDS.includes(asked) ? asked as Figure['kind'] : 'bars', title: raw ? String(raw.title ?? '') : '', points };
}

export default function Chart({ data }: { data: unknown }) {
  // The box that is measured exists only while a figure is drawn: a drawing or an answer that is no figure comes first, and a figure after them still gets measured.
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 400, h: 200 });
  // Drawn at the size of the box it is in, in its pixels, so a wide box gets a wide chart.
  useLayoutEffect(() => {
    const node = box;
    if (!node) return;
    const measure = () => setSize({ w: Math.max(160, node.clientWidth), h: Math.max(80, node.clientHeight) });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(measure);
    watch.observe(node);
    return () => watch.disconnect();
  }, [box]);
  const sole = soleValue(data);
  if (typeof sole === 'string' && sole.trim().startsWith('<svg')) return <img alt="" src={`data:image/svg+xml;utf8,${encodeURIComponent(sole)}`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />;
  const figure = figureOf(data);
  if (!figure) return <div style={{ margin: 'auto', color: 'var(--muted)' }}>{`A chart draws points -- a list of numbers, or {"kind", "title", "points": [{"label", "value"}]} -- and this is ${(JSON.stringify(data) ?? String(data)).slice(0, 100)}. A code step before it can make them.`}</div>;
  if (!figure.points.length) return <div style={{ margin: 'auto', color: 'var(--muted)' }}>{figure.title || 'Nothing to plot.'}</div>;
  // Bars have a least height of their own: with more of them than the box has room for, it scrolls rather than the letters shrinking.
  const tall = figure.kind === 'bars' ? Math.max(size.h, (figure.title ? 28 : 8) + Math.min(figure.points.length, 24) * 18 + 6) : size.h;
  return <div ref={setBox} style={{ width: '100%', height: '100%' }}><svg width={size.w} height={tall} viewBox={`0 0 ${size.w} ${tall}`} role="img" aria-label={figure.title || 'chart'}>{drawn(figure, size.w, tall)}</svg></div>;
}

function drawn(figure: Figure, W: number, H: number) {
  const { points } = figure;
  const top = figure.title ? 28 : 8;
  const title = figure.title && <text x={W / 2} y="17" textAnchor="middle" fontSize="13" fontWeight="600" style={{ fill: INK }}>{figure.title}</text>;
  const max = Math.max(...points.map((one) => one.value), 0) || 1;

  if (figure.kind === 'donut') {
    const total = points.reduce((sum, one) => sum + Math.abs(one.value), 0) || 1;
    let angle = -Math.PI / 2;
    const outer = Math.max(24, Math.min(H - top - 8, W * 0.5) / 2), inner = outer * 0.58, cx = outer + 12, cy = top + 4 + outer;
    return (
      <>
        {title}
        {points.map((one, at) => {
          const sweep = (Math.abs(one.value) / total) * Math.PI * 2;
          const from = angle; angle += sweep;
          const point = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
          const large = sweep > Math.PI ? 1 : 0;
          const d = `M ${point(outer, from)} A ${outer} ${outer} 0 ${large} 1 ${point(outer, angle - 1e-4)} L ${point(inner, angle - 1e-4)} A ${inner} ${inner} 0 ${large} 0 ${point(inner, from)} Z`;
          return <path key={at} d={d} style={{ fill: COLOURS[at % COLOURS.length] }} />;
        })}
        {points.slice(0, 12).map((one, at) => (
          <g key={at} transform={`translate(${cx + outer + 24} ${top + 12 + at * 17})`}>
            <rect width="10" height="10" y="-9" rx="2" style={{ fill: COLOURS[at % COLOURS.length] }} />
            <text x="16" fontSize="11" style={{ fill: INK }}>{one.label.slice(0, 18)} · {short(one.value)}</text>
          </g>
        ))}
      </>
    );
  }

  if (figure.kind === 'bars') {
    const shownPoints = points.slice(0, 24);
    const height = (H - top - 6) / shownPoints.length;
    const left = Math.min(130, Math.max(70, W * 0.22));
    return (
      <>
        {title}
        {shownPoints.map((one, at) => {
          const y = top + at * height;
          const width = Math.max(0, one.value / max) * (W - left - 52);
          return (
            <g key={at}>
              <text x={left - 6} y={y + height / 2 + 4} textAnchor="end" fontSize={Math.min(11, height * 0.8)} style={{ fill: MUTED }}>{one.label.slice(0, 16)}</text>
              <rect x={left} y={y + height * 0.12} width={width} height={height * 0.76} rx="2" style={{ fill: COLOURS[0] }} />
              <text x={left + width + 5} y={y + height / 2 + 4} fontSize={Math.min(11, height * 0.8)} style={{ fill: INK }}>{short(one.value)}</text>
            </g>
          );
        })}
      </>
    );
  }

  // columns and line
  const shownPoints = points.slice(0, 40);
  const left = 44, bottom = H - 26, width = W - left - 12, span = bottom - top;
  const low = Math.min(0, ...shownPoints.map((one) => one.value));
  const range = max - low || 1;
  const y = (value: number) => bottom - ((value - low) / range) * span;
  const step = width / shownPoints.length;
  const named = labelStep(shownPoints.map((one) => one.label), step);
  return (
    <>
      {title}
      <line x1={left} y1={bottom} x2={W - 12} y2={bottom} style={{ stroke: AXIS }} />
      <line x1={left} y1={top} x2={left} y2={bottom} style={{ stroke: AXIS }} />
      <text x={left - 4} y={top + 4} textAnchor="end" fontSize="10" style={{ fill: MUTED }}>{short(max)}</text>
      <text x={left - 4} y={bottom} textAnchor="end" fontSize="10" style={{ fill: MUTED }}>{short(low)}</text>
      {figure.kind === 'columns'
        ? shownPoints.map((one, at) => <rect key={at} x={left + at * step + step * 0.12} y={Math.min(y(one.value), y(0))} width={step * 0.76} height={Math.abs(y(one.value) - y(0))} rx="2" style={{ fill: COLOURS[0] }} />)
        : (
          <>
            <polyline fill="none" style={{ stroke: COLOURS[0] }} strokeWidth="2" points={shownPoints.map((one, at) => `${left + at * step + step / 2},${y(one.value)}`).join(' ')} />
            {shownPoints.map((one, at) => <circle key={at} cx={left + at * step + step / 2} cy={y(one.value)} r="2.5" style={{ fill: COLOURS[0] }} />)}
          </>
        )}
      {shownPoints.map((one, at) => (at % named === 0
        ? <text key={at} x={left + at * step + step / 2} y={bottom + 14} textAnchor="middle" fontSize="10" style={{ fill: MUTED }}>{one.label.length > 10 ? `${one.label.slice(0, 9)}…` : one.label}</text> : null))}
    </>
  );
}
