// What a window is made of, drawn the notebook's own way: boxes to put something in and boxes to show what came out.
//
// Each is a few lines of HTML; none of the gui's blocks. A box of a window has the size the window gave it and keeps it,
// whatever arrives (it scrolls inside itself).

import { useEffect, useRef, useState } from 'react';
import { asText } from '../../../gui/widgets/text_io/text.ts';
import { chatValue } from '../../../gui/widgets/chat/value.ts';
import type { InKind, OutKind, WindowIn } from '../../../gui/notebook/windows.ts';
import Browse from './Browse';
import { columnsOf, isTotal, rowOrder } from './figures';
import Chart, { soleValue } from './Chart';

/** The height of a row of a window, in pixels: what an output is as tall as, in rows. */
export const ROW = 30;

/** An input of a window; *id* is its own on the page (the id of its block: window and name), which its label points at. */
export function Input({ id, one, value, onChange, onRun, fromTitle }: { id: string; one: WindowIn; value: unknown; onChange: (value: unknown) => void; onRun: () => void; fromTitle?: string }) {
  const kind: InKind = one.kind;
  const rows = one.rows ?? (kind === 'text' ? 2 : 1);
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
          onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) onRun(); }}
        />
      )}
      {kind === 'choice' && (
        <select id={id} value={String(value ?? '')} onChange={(event) => onChange(event.target.value)}>
          {(one.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      )}
      {(kind === 'file' || kind === 'folder') && <PathBox kind={kind} value={String(value ?? '')} extensions={one.extensions} onChange={onChange} />}
      {kind === 'from' && <div className="nb-from">“{one.from?.output}” of “{fromTitle ?? 'another window'}”</div>}
    </>
  );
}

/** The last part of a path: what a person knows a file by; the whole of it is the box's title. */
const nameOf = (path: string): string => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? path;

function PathBox({ kind, value, extensions, onChange }: { kind: 'file' | 'folder'; value: string; extensions?: string; onChange: (value: string) => void }) {
  const [browsing, setBrowsing] = useState(false);
  return (
    <div className="nb-path">
      <span className={value ? '' : 'empty'} title={value}>{nameOf(value) || (kind === 'file' ? 'Choose a file…' : 'Choose a folder…')}</span>
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

const safeDecode = (text: string): string => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

/**
 * The proportions of a finished drawing -- width over height, from its viewBox or its width and height -- or none where it says neither.
 * What a step drew for its window's room (`node.window`) keeps that shape in the box it is shown in, instead of being fitted into a
 * flatter one with its letters shrunk to nothing.
 */
export function drawingAspect(value: unknown): number | null {
  const given = soleValue(Array.isArray(value) ? value[0] : value);
  // An image output gets what a step drew as a data URL (the host turned the markup into one); a chart gets the markup itself.
  const text = typeof given === 'string' && given.startsWith('data:image/svg+xml;charset=utf-8,') ? safeDecode(given.slice(given.indexOf(',') + 1)) : given;
  if (typeof text !== 'string' || !/^\s*<svg[\s>]/i.test(text)) return null;
  const tag = text.slice(0, text.indexOf('>') + 1);
  const box = /viewBox\s*=\s*"\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/i.exec(tag);
  const w = box ? Number(box[1]) : Number(/\swidth\s*=\s*"([\d.]+)(?:px)?"/i.exec(tag)?.[1]);
  const h = box ? Number(box[2]) : Number(/\sheight\s*=\s*"([\d.]+)(?:px)?"/i.exec(tag)?.[1]);
  return w > 0 && h > 0 ? w / h : null;
}

/** What an output shows, as its kind says: the text of it, a list, a table, a chart, an image. */
export function Output({ kind, value, rows }: { kind: OutKind; value: unknown; rows: number }) {
  const height = Math.max(1, rows) * ROW + 12;
  const empty = value === undefined || value === null || value === '';
  if (empty) return <div className="nb-out waiting" style={{ height }}>The result appears here</div>;
  const aspect = kind === 'chart' || kind === 'image' ? drawingAspect(value) : null;
  if (kind === 'chart') return <div className="nb-out chart" style={aspect ? { height: 'auto', aspectRatio: String(aspect), minHeight: height } : { height }}><Chart data={value} /></div>;
  // A table is as tall as its rows, up to a limit: a key-figure table with its Total row cut off is not the answer, and the rows the page gave it are a guess made before there were any.
  if (kind === 'table') return <div className="nb-out" style={{ height: Array.isArray(value) ? Math.min(Math.max(height, tableHeight(value.length)), TABLE_LIMIT) : height }}><Table value={value} /></div>;
  if (kind === 'image') return <div className="nb-out" style={aspect ? { height: 'auto', aspectRatio: String(aspect), minHeight: height } : { height }}><Pictures value={value} /></div>;
  if (kind === 'list') {
    const items = Array.isArray(value) ? value.map(asText) : asText(value).split(/\n{2,}|\n/).filter((line) => line.trim());
    return <div className="nb-out" style={{ height }}><ul>{items.map((item, at) => <li key={at}>{item}</li>)}</ul></div>;
  }
  return <div className="nb-out" style={{ height }}>{asText(value)}</div>;
}

const cell = (value: unknown): string => (typeof value === 'string' ? value : value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value));

/** The height of a table of *count* rows: its rows (30 each), a header that may run to two lines (50) and the box's own padding. */
export const tableHeight = (count: number): number => count * 30 + 50 + 24;
const TABLE_LIMIT = 14 * ROW;

function Table({ value }: { value: unknown }) {
  // Sorted by a column when its name is pressed: once one way, again the other, again as it came.
  const [sorted, sortBy] = useState<{ name: string; descending: boolean } | null>(null);
  const rows = Array.isArray(value) ? value : null;
  if (!rows || !rows.length) return <>{asText(value)}</>;
  if (rows.every((row) => Array.isArray(row))) {
    return <table><tbody>{rows.map((row, at) => <tr key={at}>{(row as unknown[]).map((one, c) => <td key={c}>{cell(one)}</td>)}</tr>)}</tbody></table>;
  }
  const columns = [...new Set(rows.flatMap((row) => (row && typeof row === 'object' ? Object.keys(row) : [])))];
  if (!columns.length) return <>{asText(value)}</>;
  // Set as its cells say (`tableFormat.ts`): figures to the right and even, a rise or a fall in colour, a Total row apart.
  // A row that is nothing (a code step may hand on a null among the rows) is an empty one.
  const objects = rows.map((row) => (row && typeof row === 'object' ? row : {})) as Record<string, unknown>[];
  const set = columnsOf(objects, columns);
  const shown = sorted && columns.includes(sorted.name)
    ? rowOrder(objects.map((row) => row[sorted.name]), sorted.descending, objects.map((row) => isTotal(row, columns)))
    : objects.map((_, at) => at);
  const press = (name: string): void => sortBy(sorted?.name !== name ? { name, descending: false } : sorted.descending ? null : { name, descending: true });
  return (
    <table>
      <thead>
        <tr>
          {set.map((one) => (
            <th key={one.name} className={`sortable${one.numeric ? ' num' : ''}`} aria-sort={sorted?.name === one.name ? (sorted.descending ? 'descending' : 'ascending') : undefined} onClick={() => press(one.name)} title="Sort by this column">
              {one.name}{sorted?.name === one.name ? (sorted.descending ? ' ▼' : ' ▲') : ''}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {shown.map((r) => objects[r]).map((row, at) => (
          <tr key={shown[at]} className={isTotal(row, columns) ? 'total' : undefined}>
            {set.map((one) => <td key={one.name} className={[one.numeric ? 'num' : '', one.tone(row[one.name]) ?? ''].filter(Boolean).join(' ') || undefined}>{one.show(row[one.name])}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** One picture fills its box; several lie side by side as a contact sheet, wrapping, each as wide as the room lets it be. */
function Pictures({ value }: { value: unknown }) {
  const items = (Array.isArray(value) ? value : [value]).filter((one): one is string => typeof one === 'string');
  if (!items.length) return <>{asText(value)}</>;
  const pictures = items.map((src, at) => (/^(data:|https?:)/.test(src) ? <img key={at} src={src} alt="" /> : <div key={at}>{src}</div>));
  return items.length === 1 ? <>{pictures}</> : <div className="nb-contact">{pictures}</div>;
}

/**
 * A conversation: what was said, a box to say the next thing, and the answer coming into it. The message in hand (`pending`) stands
 * in the transcript while it is answered, and stays there, marked, when nobody answered it. The box is as tall as its rows and the
 * transcript scrolls inside it.
 */
export function ChatBox({ value, rows, busy, error, onSend }: { value: unknown; rows: number; busy: boolean; error?: string; onSend: (text: string) => void }) {
  const { messages, pending } = chatValue(value);
  const [draft, setDraft] = useState('');
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages.length, busy, pending]);
  const send = (): void => { if (draft.trim() && !busy) { onSend(draft.trim()); setDraft(''); } };
  return (
    <div className="nb-chat" style={{ height: Math.max(3, rows) * ROW + 12 + 64 }}>
      <div className="nb-chat-log" ref={log} role="log" aria-label="Conversation">
        {messages.length === 0 && !pending && <div className="nb-chat-none">Say something to begin.</div>}
        {messages.map((one, at) => <div key={at} className={`nb-bubble ${one.role}`}>{one.text}</div>)}
        {pending && <div className="nb-bubble user">{pending}</div>}
        {pending && busy && <div className="nb-bubble assistant waiting">…</div>}
        {pending && !busy && <div className="nb-chat-none">{error ? 'It was not answered. Send it again.' : 'Not answered yet.'}</div>}
      </div>
      <form className="nb-chat-send" onSubmit={(event) => { event.preventDefault(); send(); }}>
        <textarea
          aria-label="Message" rows={2} value={draft} placeholder="Type a message…" disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }}
        />
        <button type="submit" className="nb-btn primary" disabled={busy || !draft.trim()}>Send</button>
      </form>
    </div>
  );
}
