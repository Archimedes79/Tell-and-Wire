// What a window is made of, drawn the notebook's own way: boxes to put something in and boxes to show what came out.
//
// Each is a few lines of HTML; none of the gui's blocks. A box of a window has the size the window gave it and keeps it,
// whatever arrives (it scrolls inside itself).

import { useState } from 'react';
import { asText } from '../../../gui/widgets/text_io/text.ts';
import type { InKind, OutKind, WindowIn } from '../../../gui/editor/windows/windows.ts';
import Browse from './Browse';
import Chart from './Chart';

/** The height of a row of a window, in pixels: what an output is as tall as, in rows. */
export const ROW = 30;

export function Input({ one, value, onChange, onRun }: { one: WindowIn; value: unknown; onChange: (value: unknown) => void; onRun: () => void }) {
  const kind: InKind = one.kind;
  const rows = one.rows ?? (kind === 'text' ? 2 : 1);
  const id = `in-${one.name}`;
  return (
    <>
      {kind === 'text' && (
        <textarea
          id={id} value={String(value ?? '')} placeholder="Type here…" style={{ height: Math.max(1, rows) * ROW + 8 }}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) onRun(); }}
        />
      )}
      {kind === 'number' && (
        <input
          id={id} type="number" value={String(value ?? '')} min={one.min} max={one.max} step={one.step}
          onChange={(event) => onChange(event.target.value === '' ? '' : Number(event.target.value))}
          onKeyDown={(event) => { if (event.key === 'Enter') onRun(); }}
        />
      )}
      {kind === 'choice' && (
        <select id={id} value={String(value ?? '')} onChange={(event) => onChange(event.target.value)}>
          {(one.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      )}
      {(kind === 'file' || kind === 'folder') && <PathBox kind={kind} value={String(value ?? '')} extensions={one.extensions} onChange={onChange} />}
      {kind === 'from' && <span className="nb-label">From “{one.from?.output}” of another window</span>}
    </>
  );
}

function PathBox({ kind, value, extensions, onChange }: { kind: 'file' | 'folder'; value: string; extensions?: string; onChange: (value: string) => void }) {
  const [browsing, setBrowsing] = useState(false);
  return (
    <div className="nb-path">
      <span className={value ? '' : 'empty'} title={value}>{value || (kind === 'file' ? 'Choose a file…' : 'Choose a folder…')}</span>
      {value && <button type="button" aria-label="Clear" title="Clear" onClick={() => onChange('')}>✕</button>}
      <button type="button" onClick={() => setBrowsing(true)}>Browse…</button>
      {browsing && (
        <Browse
          mode={kind} title={kind === 'file' ? 'Choose a file' : 'Choose a folder'} start={value} extensions={extensions}
          onPick={(path) => { onChange(path); setBrowsing(false); }} onClose={() => setBrowsing(false)}
        />
      )}
    </div>
  );
}

/** What an output shows, as its kind says: the text of it, a list, a table, a chart, an image. */
export function Output({ kind, value, rows }: { kind: OutKind; value: unknown; rows: number }) {
  const height = Math.max(1, rows) * ROW + 12;
  const empty = value === undefined || value === null || value === '';
  if (empty) return <div className="nb-out waiting" style={{ height }}>Waiting for output…</div>;
  if (kind === 'chart') return <div className="nb-out chart" style={{ height }}><Chart data={value} /></div>;
  if (kind === 'table') return <div className="nb-out" style={{ height }}><Table value={value} /></div>;
  if (kind === 'image') return <div className="nb-out" style={{ height }}><Pictures value={value} /></div>;
  if (kind === 'list') {
    const items = Array.isArray(value) ? value.map(asText) : asText(value).split(/\n{2,}|\n/).filter((line) => line.trim());
    return <div className="nb-out" style={{ height }}><ul>{items.map((item, at) => <li key={at}>{item}</li>)}</ul></div>;
  }
  return <div className="nb-out" style={{ height }}>{asText(value)}</div>;
}

const cell = (value: unknown): string => (typeof value === 'string' ? value : value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value));

function Table({ value }: { value: unknown }) {
  const rows = Array.isArray(value) ? value : null;
  if (!rows || !rows.length) return <>{asText(value)}</>;
  if (rows.every((row) => Array.isArray(row))) {
    return <table><tbody>{rows.map((row, at) => <tr key={at}>{(row as unknown[]).map((one, c) => <td key={c}>{cell(one)}</td>)}</tr>)}</tbody></table>;
  }
  const columns = [...new Set(rows.flatMap((row) => (row && typeof row === 'object' ? Object.keys(row) : [])))];
  if (!columns.length) return <>{asText(value)}</>;
  return (
    <table>
      <thead><tr>{columns.map((name) => <th key={name}>{name}</th>)}</tr></thead>
      <tbody>{rows.map((row, at) => <tr key={at}>{columns.map((name) => <td key={name}>{cell((row as Record<string, unknown>)[name])}</td>)}</tr>)}</tbody>
    </table>
  );
}

function Pictures({ value }: { value: unknown }) {
  const items = (Array.isArray(value) ? value : [value]).filter((one): one is string => typeof one === 'string');
  if (!items.length) return <>{asText(value)}</>;
  return <>{items.map((src, at) => (/^(data:|https?:)/.test(src) ? <img key={at} src={src} alt="" /> : <div key={at}>{src}</div>))}</>;
}
