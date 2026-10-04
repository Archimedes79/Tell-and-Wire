import { useState } from 'react';
import type { InterfaceEntry } from '../../../backend/gui-editor/graphInterface.ts';
import { DIMMER, FIELD, LINE, MUTED, PRIMARY_BUTTON } from '../../app/ui/theme';

/**
 * What *values* hold at the dotted *path* -- read here, as a frontend reads
 * it, since a delivered page loads none of the code that runs graphs.
 */
const at = (values: unknown, path: string): unknown => path.split('.')
  .reduce<unknown>((inner, key) => (inner && typeof inner === 'object' ? (inner as Record<string, unknown>)[key] : undefined), values);

/** *value* as it is typed into a box: a text as it is, anything else as its JSON, nothing as nothing. */
const typedOf = (value: unknown): string => (value === undefined || value === null ? '' : typeof value === 'string' ? value : JSON.stringify(value));

/** What a box holds, as the part it is typed as: a number a number, a structure its JSON -- or the text, where it is none. */
function readAs(type: string, text: string): unknown {
  if (type === 'number') return text.trim() === '' ? null : Number(text);
  if (type === 'boolean') return text.trim() === 'true';
  if (type === 'json' || type === 'list') {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

/** *values* with *value* put at the dotted *path*: `file.content` inside `file`. */
function put(values: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let inner = values;
  for (const key of keys.slice(0, -1)) {
    if (!inner[key] || typeof inner[key] !== 'object') inner[key] = {};
    inner = inner[key] as Record<string, unknown>;
  }
  inner[keys[keys.length - 1]] = value;
}

/**
 * The start points a call starts, as a caller would call them: the App tab
 * standing in for the script or the frontend somebody writes. For each, a box
 * for every part the graph reads of what it is sent (`reads`) -- filled with
 * what it was sent last, its example at first -- and a button that starts it
 * with them, sent along with the rest of what it was sent last.
 */
export default function CallForms({ events, sent, onCall }: {
  events: InterfaceEntry[];
  /** What each start point was sent last, by its name (`SessionView.sent`). */
  sent: Record<string, unknown>;
  onCall: (event: string, values: Record<string, unknown>) => void;
}) {
  const called = events.filter((event) => event.started_by === 'call');
  if (!called.length) return null;
  return (
    <div className="px-8 py-4 space-y-5" style={{ borderBottom: `1px solid ${LINE}` }}>
      {called.map((event) => <CallForm key={event.name} event={event} sent={sent[event.name]} onCall={onCall} />)}
    </div>
  );
}

function CallForm({ event, sent, onCall }: { event: InterfaceEntry; sent: unknown; onCall: (event: string, values: Record<string, unknown>) => void }) {
  const reads = event.reads ?? [];
  // What is typed, by part. A part nobody typed into shows what it was sent last.
  const [typed, setTyped] = useState<Record<string, string>>({});
  const shown = (name: string): string => typed[name] ?? typedOf(at(sent, name));
  const call = () => {
    const values = structuredClone(sent && typeof sent === 'object' && !Array.isArray(sent) ? sent : {}) as Record<string, unknown>;
    for (const read of reads) put(values, read.name, readAs(read.type, shown(read.name)));
    setTyped({});
    onCall(event.name, values);
  };
  return (
    <form className="space-y-2 max-w-2xl" onSubmit={(e) => { e.preventDefault(); call(); }}>
      <p className="text-xs" style={{ color: MUTED }}>
        <strong>{event.label}</strong> — started by a call{event.description ? `: ${event.description}` : ''}
      </p>
      {reads.map((read) => (
        <label key={read.name} className="block text-xs" style={{ color: DIMMER }}>
          {read.label} <span className="font-mono">&quot;{read.name}&quot;</span>
          <textarea
            className="mt-1 w-full rounded-lg px-3 py-2 text-sm resize-y"
            style={{ ...FIELD, minHeight: read.type === 'text' || read.type === 'any' ? 64 : 36 }}
            value={shown(read.name)}
            onChange={(e) => setTyped((before) => ({ ...before, [read.name]: e.target.value }))}
            aria-label={read.label}
          />
        </label>
      ))}
      {!reads.length && (
        <p className="text-xs" style={{ color: DIMMER }}>No node takes a part of what it is sent by name: it is sent what it was sent last.</p>
      )}
      <button type="submit" className="px-4 py-1.5 text-sm rounded-lg font-semibold" style={PRIMARY_BUTTON}>{event.label}</button>
    </form>
  );
}
