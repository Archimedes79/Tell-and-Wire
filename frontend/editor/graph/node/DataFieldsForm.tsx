import { useState } from 'react';
import type { GraphNode } from '../../document/graph';
import Button from '../../../deployment/gui/kit/ui/Button';
import { DANGER_TEXT, DIM, FIELD, LINE, MUTED, TEXT } from '../../../deployment/gui/kit/ui/theme';
import type { NodePanelProps } from '../nodes/NodeGuiBuilder';
import { fileOf } from '../writing/generation';

/** What a name typed becomes: a field name a body can read and a wire can point at -- spaces and marks as "_". */
export function fieldName(typed: string): string {
  return typed.trim().replace(/[^\p{L}\p{N}_]+/gu, '_').replace(/^_+|_+$/g, '');
}

/** What a field starts as, from what was typed: a number, true, a list, a record where it reads as one, else the words as typed. */
export function startValue(typed: string): unknown {
  const text = typed.trim();
  if (!text) return '';
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * A data node's fields by hand: a name and what it starts as, and the fields it
 * has, each to take away. For the person with no AI set up, who otherwise has to
 * write data.json -- the same thing, as JSON -- or say it to a chat.
 */
export default function DataFieldsForm({ node, setConfig }: { node: GraphNode; setConfig: NodePanelProps['setConfig'] }) {
  const { field } = fileOf(node, 'body');
  const held = (node.config as Record<string, unknown>)[field];
  const fields = held && typeof held === 'object' && !Array.isArray(held) ? held as Record<string, unknown> : {};
  const [name, setName] = useState('');
  const [start, setStart] = useState('0');
  const key = fieldName(name);
  const taken = Object.prototype.hasOwnProperty.call(fields, key);
  const add = () => {
    if (!key || taken) return;
    setConfig(field, { ...fields, [key]: startValue(start) });
    setName('');
    setStart('0');
  };
  const input = 'h-8 rounded-md px-2 text-sm min-w-0';
  return (
    <section className="flex flex-col gap-2 text-xs" style={{ color: MUTED }} aria-label="Fields by hand">
      <p>Or add a field yourself: its name, and what it starts as.</p>
      <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); add(); }}>
        <input
          className={`${input} w-40`}
          style={FIELD}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name, e.g. total"
          aria-label="Field name"
        />
        <input
          className={`${input} w-32`}
          style={FIELD}
          value={start}
          onChange={(event) => setStart(event.target.value)}
          placeholder="Starts as, e.g. 0"
          aria-label="What the field starts as"
        />
        <Button size="sm" type="submit" disabled={!key || taken}>Add field</Button>
      </form>
      {taken && <p role="alert" style={{ color: DANGER_TEXT }}>There is a field “{key}” already.</p>}
      {!taken && key && key !== name.trim() && <p>It will be called “{key}”: a name has letters, digits and “_”.</p>}
      {Object.keys(fields).length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Its fields">
          {Object.entries(fields).map(([name, value]) => (
            <li key={name} className="flex items-center gap-1 rounded-full px-2 py-0.5" style={{ border: `1px solid ${LINE}`, color: TEXT }}>
              <span>{name}</span>
              <span style={{ color: DIM }}>{typeof value === 'string' ? `“${value}”` : JSON.stringify(value)}</span>
              <button
                type="button"
                className="ml-1 px-1 rounded"
                style={{ color: DIM }}
                title={`Take the field “${name}” away`}
                aria-label={`Take the field ${name} away`}
                onClick={() => {
                  const { [name]: _gone, ...rest } = fields;
                  setConfig(field, rest);
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
