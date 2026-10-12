import { useLayoutEffect, useRef, useState } from 'react';

// A chart, drawn here: bars, columns, a line or a donut from `{ kind, title, points: [{ label, value }] }` -- or SVG a step
// wrote, shown as a picture (so nothing in it runs).

interface Point { label: string; value: number }
interface Figure { kind: 'bars' | 'columns' | 'line' | 'donut'; title: string; points: Point[] }

const COLOURS = ['#3d63d8', '#8a5ad8', '#1f9a76', '#d98a1f', '#d84a6a', '#2b9ac9', '#7a8494', '#b0b800'];
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

/** What arrived at a chart, as a figure: a figure itself, or a list of numbers or of `{ label, value }`. */
function figureOf(data: unknown): Figure | null {
  const raw = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : null;
  const list = raw ? raw.points : data;
  if (!Array.isArray(list)) return null;
  const points: Point[] = [];
  for (let at = 0; at < list.length; at += 1) {
    const item = list[at];
    const object = item && typeof item === 'object' ? item as Record<string, unknown> : undefined;
    const value = numberOf(object ? object.y ?? object.value : item);
    if (value === null) return null;
    points.push({ label: String(object ? object.x ?? object.label ?? at : at), value });
  }
  return { kind: raw && KINDS.includes(String(raw.kind)) ? raw.kind as Figure['kind'] : 'bars', title: raw ? String(raw.title ?? '') : '', points };
}

export default function Chart({ data }: { data: unknown }) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 400, h: 200 });
  // Drawn at the size of the box it is in, in its pixels, so a wide box gets a wide chart.
  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    const measure = () => setSize({ w: Math.max(160, node.clientWidth), h: Math.max(80, node.clientHeight) });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(measure);
    watch.observe(node);
    return () => watch.disconnect();
  }, []);
  if (typeof data === 'string' && data.trim().startsWith('<svg')) return <img alt="" src={`data:image/svg+xml;utf8,${encodeURIComponent(data)}`} style={{ maxWidth: '100%', maxHeight: '100%', margin: 'auto' }} />;
  const figure = figureOf(data);
  if (!figure) return <div style={{ margin: 'auto', color: 'var(--muted)' }}>This is not something a chart can draw.</div>;
  if (!figure.points.length) return <div style={{ margin: 'auto', color: 'var(--muted)' }}>{figure.title || 'Nothing to plot.'}</div>;
  // Bars have a least height of their own: with more of them than the box has room for, it scrolls rather than the letters shrinking.
  const tall = figure.kind === 'bars' ? Math.max(size.h, (figure.title ? 28 : 8) + Math.min(figure.points.length, 24) * 18 + 6) : size.h;
  return <div ref={box} style={{ width: '100%', height: '100%' }}><svg width={size.w} height={tall} viewBox={`0 0 ${size.w} ${tall}`} role="img" aria-label={figure.title || 'chart'}>{drawn(figure, size.w, tall)}</svg></div>;
}

function drawn(figure: Figure, W: number, H: number) {
  const { points } = figure;
  const top = figure.title ? 28 : 8;
  const title = figure.title && <text x={W / 2} y="17" textAnchor="middle" fontSize="13" fontWeight="600" fill="#151a23">{figure.title}</text>;
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
          return <path key={at} d={d} fill={COLOURS[at % COLOURS.length]} />;
        })}
        {points.slice(0, 12).map((one, at) => (
          <g key={at} transform={`translate(${cx + outer + 24} ${top + 12 + at * 17})`}>
            <rect width="10" height="10" y="-9" rx="2" fill={COLOURS[at % COLOURS.length]} />
            <text x="16" fontSize="11" fill="#151a23">{one.label.slice(0, 18)} · {short(one.value)}</text>
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
              <text x={left - 6} y={y + height / 2 + 4} textAnchor="end" fontSize={Math.min(11, height * 0.8)} fill="#566070">{one.label.slice(0, 16)}</text>
              <rect x={left} y={y + height * 0.12} width={width} height={height * 0.76} rx="2" fill={COLOURS[0]} />
              <text x={left + width + 5} y={y + height / 2 + 4} fontSize={Math.min(11, height * 0.8)} fill="#151a23">{short(one.value)}</text>
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
  return (
    <>
      {title}
      <line x1={left} y1={bottom} x2={W - 12} y2={bottom} stroke="#c7cdd8" />
      <line x1={left} y1={top} x2={left} y2={bottom} stroke="#c7cdd8" />
      <text x={left - 4} y={top + 4} textAnchor="end" fontSize="10" fill="#566070">{short(max)}</text>
      <text x={left - 4} y={bottom} textAnchor="end" fontSize="10" fill="#566070">{short(low)}</text>
      {figure.kind === 'columns'
        ? shownPoints.map((one, at) => <rect key={at} x={left + at * step + step * 0.12} y={Math.min(y(one.value), y(0))} width={step * 0.76} height={Math.abs(y(one.value) - y(0))} rx="2" fill={COLOURS[0]} />)
        : (
          <>
            <polyline fill="none" stroke={COLOURS[0]} strokeWidth="2" points={shownPoints.map((one, at) => `${left + at * step + step / 2},${y(one.value)}`).join(' ')} />
            {shownPoints.map((one, at) => <circle key={at} cx={left + at * step + step / 2} cy={y(one.value)} r="2.5" fill={COLOURS[0]} />)}
          </>
        )}
      {shownPoints.map((one, at) => (at % Math.ceil(shownPoints.length / 8) === 0
        ? <text key={at} x={left + at * step + step / 2} y={bottom + 14} textAnchor="middle" fontSize="10" fill="#566070">{one.label.slice(0, 8)}</text> : null))}
    </>
  );
}
