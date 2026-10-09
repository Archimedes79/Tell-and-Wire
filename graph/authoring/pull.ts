// Pull: the input definition a node's wires imply.
//
// A node's input.js says what one call of it is handed: a type for each input,
// and one example. A model can write that from the node's text -- or it can be
// read off the graph, since what each wire carries is said by the node it comes
// from: its output.js gives the type, a run of what comes before it gives the
// example. Put together, they are a file. Nothing is asked of a model for it
// (unless a node before it asks one to run).
//
// This is the file's format and the rules for an example; what feeds each input
// is read from the graph by the editor (`frontend/graph-editor/authoring/pull.ts`).

/** One input as a pull writes it into input.js. */
export interface PulledPort {
  id: string;
  /** Its JSDoc type: `string`, `Array<Object>`, `*` for one nothing is known of. */
  type: string;
  /** What it is, on the line of its `@property`; none, for nothing to say. */
  description: string;
  /** One value of it, as JSON; none: `null`. */
  example: unknown;
}

/** How much of a text an example keeps, and how many items of a list: a file's worth of data is a few lines. */
const TEXT_KEPT = 1000;
const ITEMS_KEPT = 3;

/** The JSDoc type of *value*, as an example of it shows it. */
export function typeOfValue(value: unknown): string {
  if (value === null || value === undefined) return '*';
  if (Array.isArray(value)) return `Array<${value.length ? typeOfValue(value[0]) : '*'}>`;
  if (typeof value === 'object') return 'Object';
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? typeof value : '*';
}

/**
 * *value* as an example of itself: a long text cut where it is long, a long
 * list shortened, a file handed as itself (a `data:` URL) said by its start --
 * the example is what a model reads and what ▶ Try runs on, not the data.
 */
export function shortExample(value: unknown): unknown {
  if (typeof value === 'string') {
    if (/^data:[\w.+/-]+;base64,/.test(value)) return `${value.slice(0, value.indexOf(',') + 1)}...`;
    return value.length > TEXT_KEPT ? `${value.slice(0, TEXT_KEPT)}…` : value;
  }
  if (Array.isArray(value)) return value.slice(0, ITEMS_KEPT).map(shortExample);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shortExample(item)]));
  return value;
}

/** The input.js that says *ports*: a JSDoc typedef, one `@property` each, then one example, as plain JSON. */
export function inputFile(ports: PulledPort[]): string {
  // On one line, and never ending its comment.
  const said = (text: string): string => text.replace(/\s+/g, ' ').replace(/\*\//g, '* /').trim();
  const properties = ports.map((port) => ` * @property {${port.type}} ${port.id}${port.description.trim() ? `  ${said(port.description)}` : ''}`);
  const example = Object.fromEntries(ports.map((port) => [port.id, shortExample(port.example) ?? null]));
  return ['/**', ' * @typedef {Object} Input', ...properties, ' */', `module.exports = ${JSON.stringify(example, null, 2)};`].join('\n');
}
