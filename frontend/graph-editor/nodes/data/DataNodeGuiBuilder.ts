import type { GraphNode } from '../../../app/graph';
import { DataNodeRunner, ALL_FIELDS, ROUND, hasField } from '../../../../graph/nodes/data/DataNodeRunner.ts';
import { derivedNodePorts } from '../../../app/document/ports';
import { INK, NODE } from '../../../app/ui/theme';
import { NodeGuiBuilder } from '../NodeGuiBuilder';
import { Database } from 'lucide-react';

const DATA = new DataNodeRunner();

/** How much of what a data node holds the nodes wired to it are told, in characters: enough for its keys and a few records. */
const HELD_SHOWN = 600;

/** A value in a few words, for the card: a list as its length, a record as braces, a text cut short. */
function briefly(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value.length > 24 ? `${value.slice(0, 23)}…` : value);
  if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? 'item' : 'items'}`;
  if (value && typeof value === 'object') return '{…}';
  return String(value);
}

/** What *port* of *node* holds filled: its example, or what it starts as where the example leaves it out. */
function valueOf(node: GraphNode, port: string): unknown {
  const { fields, example } = DATA.config(node as never);
  return hasField(example, port) ? example[port] : fields[port];
}

export class DataNodeGuiBuilder extends NodeGuiBuilder {
  readonly nodeType = 'data';

  // ── Build time ────────────────────────────────────────────────────────────

  readonly label = 'Data';

  readonly hint = 'Remember fields between runs, so a loop can build on its own last result';

  readonly example = 'e.g. The three latest summaries, newest first, and how many summaries it has seen';

  readonly color = NODE.data;

  /** Its icon, on its card and in the palette. */
  readonly icon = Database;

  /** Its colour as ink on a surface: the icon on its card, the chip in the palette (`INK`). */
  readonly ink = INK.data;

  override readonly paletteGroup = 'Processing';

  // A data node IS the graph's register: a struct that holds its fields between
  // runs, which is what lets a loop through a field close. Its ports
  // are its fields (`DataNodeRunner.derivedPorts`), so there are none to edit, and
  // its one file, data.json, is edited in its file's pane and written by its chat.

  /** A file dropped on it on the canvas is its fields from now on: what the file says, an object -- or one field, "value". */
  override dropPort(): 'text' {
    return 'text';
  }

  override withDropped(node: GraphNode, value: unknown): GraphNode {
    const fields = value && typeof value === 'object' && !Array.isArray(value) ? value : { value };
    const next = { ...node, config: { ...node.config, data_value: fields } };
    return { ...next, ...(derivedNodePorts(next) ?? {}) };
  }

  /**
   * What a wire from it carries -- one field, or all of them (*port*) -- what
   * its text says, and the start of what it holds filled (`example.json`), as
   * JSON: what the nodes wired to it are told it hands on. The value itself,
   * since its keys are in it: told only "ten capitals", ✨ Input wrote
   * "Capital" where the records say "capital", and the table stayed empty.
   */
  override describeOutput(node: GraphNode, port?: string): string {
    const { fields, example } = DATA.config(node as never);
    const names = Object.keys(fields);
    const details = node.description?.trim();
    const start = (value: unknown) => {
      const json = JSON.stringify(value) ?? '';
      return json.length > HELD_SHOWN ? `${json.slice(0, HELD_SHOWN)}… (${json.length - HELD_SHOWN} more characters)` : json;
    };
    if (port === ROUND) return `the number of the round, from 1: how many rounds the struct has been through, the one it is in included${details ? ` -- of a struct: ${details}` : ''}`;
    if (port !== undefined && hasField(fields, port)) return `the field "${port}" of a struct${details ? `: ${details}` : ''} -- as rounds fill it, it holds: ${start(valueOf(node, port))}`;
    const said = `a struct of ${names.length ? `the fields ${names.map((name) => `"${name}"`).join(', ')}` : 'no fields yet'}${details ? `: ${details}` : ''}; "${ALL_FIELDS}" is all of them`;
    return names.length ? `${said} -- as rounds fill it, it holds: ${start(example)}` : said;
  }

  /** What it remembers, the start of it, under its ports: each field and a few words of what it holds. */
  override canvasSummary(node: GraphNode): string {
    const { fields } = DATA.config(node as never);
    const entries = Object.entries(fields);
    return entries.length ? entries.map(([name, value]) => `${name} ${briefly(value)}`).join(' · ') : 'no fields yet';
  }

  /**
   * What a field holds as rounds fill it: the example is what whoever reads or
   * writes it is written against, where a run shows only how it starts.
   * Nothing, for an empty field -- or a port that is none of its fields.
   */
  override restingValue(node: GraphNode, port: string): unknown {
    const { example } = DATA.config(node as never);
    const value = port === ALL_FIELDS ? { ...example, [ROUND]: 1 } : port === ROUND ? 1 : valueOf(node, port);
    return value === '' || value === null ? undefined : value;
  }

  /** What a field is: it holds what arrives on it, and looks like this filled. The gate says nothing of the sort. */
  override wantsOn(node: GraphNode, port: string): string | undefined {
    const { fields } = DATA.config(node as never);
    if (!hasField(fields, port)) return super.wantsOn(node, port);
    const now = JSON.stringify(valueOf(node, port));
    return `the field "${port}" it stores: what arrives replaces its value${now === undefined ? '' : ` -- filled, it holds ${now.length > 200 ? `${now.slice(0, 200)}…` : now}`}`;
  }
}
