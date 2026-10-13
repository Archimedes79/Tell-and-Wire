// Windows: a tool said as a page of fixed windows, each one a short list of cells.
//
//     what goes in  ->  what should be done  ->  what comes out
//
// A window is not a new kind of node or block. It is the editor's way to write
// both at once, and `windowsToGraph` turns a list of windows into the graph and
// the gui the rest of the system already runs: a start point that the window's
// own Run button and inputs fire, a node for every cell that does something
// (an ai node, or code), an end point for every cell that shows something, and
// the blocks that send to the one and show the others.
//
// **A cell is wired to what it names.** Everything before a cell is there for
// it; it takes what its sentence mentions (`@File`, `@Summary`) and nothing
// else, and a cell that mentions nothing takes what comes right before it. So
// the wires of a window are never drawn: they are read off the sentences, and
// the chips "takes: File, Length" show them. Another window's output is an
// input of this one, named like any other.
//
// **The elements are the window.** What goes in and what comes out are the
// ports of the cells and the blocks the window is drawn with, each as wide as a
// share of the window and as tall as its rows say (`windowRows`). Cells are
// square and shrink with the page, so a window keeps its shape at any width,
// and an output that arrives later fills the room it was given.
//
// Editor only, like everything that is written for a person: a package runs
// the graph and the gui this makes, and carries nothing of this file.

import type { DataType, Graph, GraphEdge, GraphNode, Port, RawConfig, WidgetKind } from '../../graph/graph.ts';
import { wireOf } from '../../graph/files/flow.ts';
import { parseWidget } from '../gui.ts';
import { BLOCK_CHROME, GUI_GAP, GUI_MAX_CELL, WINDOW_BORDER, WINDOW_PADDING } from '../windows/grid.ts';
import { plotColours, scheme } from '../windows/scheme.ts';
import { widgetDesign } from '../editor/widgets/roster.ts';
import { pageOf } from './pageModel.ts';
import { registry } from '../../graph/nodes/registry.ts';
import { port } from '../../graph/nodes/port.ts';
import { tableLines } from '../../graph/schedule.ts';
import { RUN_PORT, START_PORT } from '../../graph/triggers.ts';
import type { Problem } from '../../graph/wiring.ts';
import { afterRun as orderAfterRun, currentWindows as orderCurrent, runOrder as orderRun, type Done, type Linked } from '../windows/order.ts';

/** What can go into a window. `from` takes what another window made. */
export type InKind = 'file' | 'folder' | 'text' | 'number' | 'choice' | 'from';

/** What can come out of a window. */
export type OutKind = 'text' | 'list' | 'table' | 'chart' | 'image' | 'chat';

export interface WindowIn {
  /** What sentences call it (`@Name`) and what the window labels it. */
  name: string;
  kind: InKind;
  /** `choice`: what can be chosen, the first being the one it stands at. */
  options?: string[];
  /** `file`, `folder`: the file types it takes, `.txt, .md`. */
  extensions?: string;
  /** `number`: its range. */
  min?: number;
  max?: number;
  step?: number;
  /** What it holds to begin with: a path, a number, a choice, some text. */
  value?: string | number;
  /** `from`: the output of another window that this one takes. */
  from?: { window: string; output: string };
  /** How much of the window's width it takes, from 0 to 1. */
  width?: number;
  /** How many rows it is tall, where the kind's own is not what is wanted. */
  rows?: number;
}

/** A cell that does something: a sentence, and who does it. */
export interface Step {
  /** What it is called: `@Name` points at its result, and its node shows it. */
  name: string;
  /** What should be done, in a sentence. It is also what an ai node is told. */
  sentence: string;
  /** Who does it: a model, or code (which `code` seeds, until it is written). */
  how: 'ai' | 'code';
  code?: string;
  /** Once for each file of a folder it takes, a few at a time, rather than once for all. */
  each?: boolean;
  /** What it hands on, by name. One, called like the step, when it says none. Several only for code. */
  results?: string[];
}

/** A cell that shows something that was made. */
export interface WindowOut {
  name: string;
  kind: OutKind;
  /** How many rows tall it is. */
  rows: number;
  /** How much of the window's width it takes, from 0 to 1. */
  width?: number;
  /** The result it shows; the first of the last step's, where it says none. */
  of?: string;
}

/** What a block of the page is: a heading, a paragraph, a list, a gap, or a window standing in the text. */
export type BlockKind = 'h1' | 'h2' | 'p' | 'ul' | 'space' | 'window';

/** One block of the page, as an editor of pages has it. A list keeps its items one to a line in *text*; a window names itself by *window*. */
export interface PageBlock {
  id: string;
  kind: BlockKind;
  text?: string;
  window?: string;
}

export interface Window {
  /** Lower case, letters, digits and `_`: it names the window's start point and every node and block of it. */
  id: string;
  title: string;
  /** Cells across of the gui's 16 that the window takes. */
  span: number;
  inputs: WindowIn[];
  steps: Step[];
  outputs: WindowOut[];
  /** What starts the window; the Run button, where it says nothing. */
  trigger?: Trigger;
  /** What the window asks of the person, in a sentence: said beside its inputs, and told to the model with them. */
  ask?: string;
}

/**
 * What starts a window: a button, a change of an input, or both. It belongs to
 * the window's start point, not to any cell that does something: the button
 * and the inputs name the start point (`fires`, `sends_to`), the start point
 * is wired to the cells that take what it is sent, and so a cell neither
 * knows what started it nor whether a model or code makes it. A model costs
 * money, so a change of an input starts nothing unless said.
 *
 * Starting by itself -- when the tool starts, every few minutes -- is a start
 * point that is its own sender and takes no inputs of the gui, so it is not a
 * trigger of a window that has any.
 */
export interface Trigger {
  /** A button, `true` where it says nothing. */
  button?: boolean;
  /** What the button says. */
  label?: string;
  /** Changing an input starts the window. */
  onChange?: boolean;
}

/** The look of a tool that says none: white. */
export const DEFAULT_SCHEME = 'white';

export interface Windows {
  name: string;
  description: string;
  /** The gui's colour scheme (`metadata.gui_scheme`); white, where it says none. */
  scheme?: string;
  windows: Window[];
  /** The text of the page and where the windows stand in it. Left out, the page is its name, its description and the windows in turn (`pageOf`). */
  page?: PageBlock[];
}

/** An element's name as an id: letters and digits, the rest `_`. */
export function idOf(name: string): string {
  const plain = name.trim().toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  return plain.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'x';
}

// ---- how big a window is ---------------------------------------------------
//
// In the gui's own unit, the cell: square, a sixteenth of the page across, and
// smaller on a narrower page, so nothing here is a size in pixels and a window
// looks the same at any width. The window's heading and its Run row are one
// row each; the elements between flow left to right in lines, wrapping as the
// gui's blocks do, and a line is as tall as its tallest element.

const IN_ROWS: Record<InKind, number> = { file: 2, folder: 2, text: 2, number: 1, choice: 2, from: 1 };

/** How many rows an output of *kind* is given by default, small, medium or large. */
export const SIZES: Record<OutKind, Record<'S' | 'M' | 'L', number>> = {
  text: { S: 2, M: 3, L: 5 },
  list: { S: 3, M: 5, L: 7 },
  table: { S: 4, M: 5, L: 7 },
  chart: { S: 4, M: 5, L: 7 },
  image: { S: 3, M: 4, L: 6 },
  chat: { S: 5, M: 7, L: 9 },
};

/** An element of a window, as it is laid out: how many cells across, how many rows down at least. */
interface Piece { cells: number; rows: number }

const cellsOf = (span: number, width: number | undefined): number => Math.min(span, Math.max(1, Math.round((width ?? 1) * span)));
const inPiece = (window: Window, one: WindowIn): Piece => ({ cells: cellsOf(window.span, one.width), rows: one.rows ?? IN_ROWS[one.kind] });
const outPiece = (window: Window, one: WindowOut): Piece => ({ cells: cellsOf(window.span, one.width), rows: Math.max(1, one.rows) });

/** *pieces* in lines of at most *span* cells, each piece with the height of its line. */
function inLines(pieces: Piece[], span: number): { piece: Piece; rows: number }[][] {
  const lines: Piece[][] = [];
  let used = 0;
  for (const piece of pieces) {
    if (!lines.length || used + piece.cells > span) { lines.push([]); used = 0; }
    lines[lines.length - 1].push(piece);
    used += piece.cells;
  }
  return lines.map((line) => line.map((piece) => ({ piece, rows: Math.max(...line.map((one) => one.rows)) })));
}

/** Whether a window has a button: unless it says it has none, and unless a chat is sent from by its own box. */
const hasButton = (window: Window): boolean => window.trigger?.button !== false && !window.outputs.some((one) => one.kind === 'chat');

/** The window's height in cells: heading, the lines of inputs, the row with its button, the lines of outputs. Fixed by the elements alone. */
export function windowRows(window: Window): number {
  const height = (pieces: Piece[]): number => inLines(pieces, window.span).reduce((sum, line) => sum + line[0].rows, 0);
  return 1 + height(window.inputs.map((one) => inPiece(window, one))) + (hasButton(window) ? 1 : 0) + height(window.outputs.map((one) => outPiece(window, one)));
}

// ---- what a sentence points at ----------------------------------------------

/** One `@Name` of a sentence, or `@Name.part` for one part of what it is: a file's `path`. */
export interface Mention { name: string; part?: string }

/** The mentions of a sentence, in the order they stand. */
export function mentions(sentence: string): Mention[] {
  return [...sentence.matchAll(/@([\p{L}\p{N}_-]+)(?:\.(path|content|message|history))?/gu)].map((found) => ({ name: found[1], ...(found[2] ? { part: found[2] } : {}) }));
}

/** What a step hands on: its results, by name. */
export const resultsOf = (step: Step): string[] => (step.results?.length ? step.results : [step.name]);

/** The id of the node of *step*. */
export const stepNode = (window: Window, step: Step): string => `${window.id}_${idOf(step.name)}`;
/** The id of the end point of output *one*, which is also its block. */
export const outEnd = (window: Window, one: WindowOut): string => `${window.id}_out_${idOf(one.name)}`;
export const inBlock = (window: Window, one: WindowIn): string => `${window.id}_in_${idOf(one.name)}`;

/** The port a result leaves its node by: `output` while an ai node makes only the one, as its answer does. */
const resultPort = (step: Step, result: string): string => (step.how === 'ai' ? 'output' : idOf(result));

/** Where a mention comes from, and how the port that takes it is made. */
interface Source { node: string; port: string; field?: string; type: DataType; multi: boolean; label: string }

/** The step of *window* that makes *result*, and the port it leaves by. */
function producer(window: Window, result: string): { step: Step; node: string; port: string } | undefined {
  const step = window.steps.find((one) => resultsOf(one).some((name) => idOf(name) === idOf(result)));
  return step ? { step, node: stepNode(window, step), port: resultPort(step, result) } : undefined;
}

/** The result a window's output *one* shows. */
function shownResult(window: Window, one: WindowOut): string | undefined {
  return one.of ?? resultsOf(window.steps[window.steps.length - 1] ?? { name: '', sentence: '', how: 'ai' })[0];
}

/** The kind of block that shows each kind of output. */
const OUT_BLOCK: Record<OutKind, WidgetKind> = { text: 'text_io', list: 'text_io', table: 'table', chart: 'plot_window', image: 'image_view', chat: 'chat' };

const OUT_TYPE: Record<OutKind, DataType> = { text: 'text', list: 'text', table: 'json', chart: 'json', image: 'image', chat: 'text' };
const IN_TYPE: Record<InKind, DataType> = { file: 'text', folder: 'file_path', text: 'text', number: 'number', choice: 'text', from: 'text' };

const multiStep = (step: Step): boolean => step.each === true;

/** What a mention in step *at* of *window* points at: an input, an earlier step's result, another window's output. */
function sourceOf(doc: Windows, window: Window, at: number, mention: Mention): Source | undefined {
  const input = window.inputs.find((one) => idOf(one.name) === idOf(mention.name));
  // A chat is sent from and shown in one box: what it was sent is the message, and the conversation so far.
  const chat = input ? undefined : window.outputs.find((one) => one.kind === 'chat' && idOf(one.name) === idOf(mention.name));
  if (chat) {
    return { node: window.id, port: START_PORT, field: `${outEnd(window, chat)}.${mention.part === 'history' ? 'history' : 'message'}`, type: 'text', multi: false, label: chat.name };
  }
  if (input && input.kind !== 'from') {
    const block = inBlock(window, input);
    const part = input.kind === 'file' ? mention.part ?? 'content' : undefined;
    return {
      node: window.id, port: START_PORT, field: part ? `${block}.${part}` : block,
      type: part === 'path' ? 'text' : IN_TYPE[input.kind], multi: input.kind === 'folder', label: input.name,
    };
  }
  if (input?.from) {
    const other = doc.windows.find((one) => one.id === input.from!.window);
    const output = other?.outputs.find((one) => idOf(one.name) === idOf(input.from!.output));
    const made = other && output ? shownResult(other, output) : undefined;
    const from = other && made ? producer(other, made) : undefined;
    if (other && output && from) return { node: from.node, port: from.port, type: OUT_TYPE[output.kind], multi: multiStep(from.step), label: input.name };
  }
  for (const step of window.steps.slice(0, at)) {
    const result = resultsOf(step).find((name) => idOf(name) === idOf(mention.name));
    if (result) return { node: stepNode(window, step), port: resultPort(step, result), type: 'text', multi: multiStep(step), label: result };
  }
  return undefined;
}

/** The mentions step *at* takes: the ones its sentence makes, else everything before it. */
export function taken(window: Window, at: number): Mention[] {
  const said = mentions(window.steps[at].sentence);
  if (said.length) return said;
  if (at > 0) return resultsOf(window.steps[at - 1]).map((name) => ({ name }));
  // The first step takes everything that goes in: and from a chat, the message and what was said before it.
  return [
    ...window.inputs.map((one) => ({ name: one.name })),
    ...window.outputs.filter((one) => one.kind === 'chat').flatMap((one) => [{ name: one.name, part: 'message' }, { name: one.name, part: 'history' }]),
  ];
}

// ---- what is wrong ---------------------------------------------------------

/** Every window that *id* takes something from, directly. */
function upstream(doc: Windows, id: string): string[] {
  return [...new Set(doc.windows.find((window) => window.id === id)?.inputs.flatMap((one) => (one.from ? [one.from.window] : [])) ?? [])];
}

/** Whether window *id* takes, however far back, from *from*. */
function takesFrom(doc: Windows, id: string, from: string, seen = new Set<string>()): boolean {
  if (seen.has(id)) return false;
  seen.add(id);
  return upstream(doc, id).some((one) => one === from || takesFrom(doc, one, from, seen));
}

/** What would make the windows not become a graph that works, each with what to do about it. */
export function windowProblems(doc: Windows): Problem[] {
  const problems: Problem[] = [];
  const ids = new Set<string>();
  for (const window of doc.windows) {
    const where = `window "${window.id}"`;
    const say = (problem: string, fix: string): number => problems.push({ where, problem, fix });
    if (!/^[a-z][a-z0-9_]*$/.test(window.id)) say('Its id is not lower case letters, digits and "_", starting with a letter.', 'Rename it, for example "summarize".');
    if (ids.has(window.id)) say('Another window has this id.', 'Give each window an id of its own.');
    ids.add(window.id);
    if (!window.steps.length) say('Nothing is done in it.', 'Add a cell that says what should be done: "Summarize @Text in @Length."');
    if (!window.outputs.length) say('Nothing comes out of it, so it shows nobody anything.', 'Add an output: text, a list, a table, a chart or an image.');
    if (window.trigger?.button === false && !window.trigger.onChange) say('Nothing starts it: it has no button and a change of an input does not run it.', 'Keep the button, or let a change of an input start it.');
    // Inputs, results and steps share the one set of names a sentence points into.
    const named = new Map<string, string>();
    const claim = (name: string, what: string): void => {
      const other = named.get(idOf(name));
      if (other) say(`${what} "${name}" and ${other} are called alike.`, 'Rename one: sentences point at things by name.');
      named.set(idOf(name), `${what} "${name}"`);
    };
    window.inputs.forEach((one) => claim(one.name, 'input'));
    window.steps.forEach((step) => resultsOf(step).forEach((name) => claim(name, 'result')));
    const outs = new Set<string>();
    for (const one of window.outputs) {
      if (outs.has(idOf(one.name))) say(`Two outputs are called "${one.name}" (or alike).`, 'Rename one.');
      outs.add(idOf(one.name));
      if (one.of && !window.steps.some((step) => resultsOf(step).some((name) => idOf(name) === idOf(one.of!)))) say(`"${one.name}" shows "${one.of}", which no cell makes.`, 'Pick one of the results.');
    }
    window.steps.forEach((step, at) => {
      if (!step.sentence.trim()) say(`The cell "${step.name}" says nothing about what should be done.`, 'Write a sentence.');
      if (step.how === 'code' && !(step.code ?? '').trim()) say(`The cell "${step.name}" is code and holds none yet.`, 'Write function run(inputs) { ... } in it, or let a model do the step.');
      if (step.how === 'ai' && resultsOf(step).length > 1) say(`The cell "${step.name}" is a model's and hands on several results.`, 'Give a model one result; split the work, or let code make several.');
      if (step.each && !taken(window, at).some((one) => window.inputs.find((input) => idOf(input.name) === idOf(one.name))?.kind === 'folder')) say(`The cell "${step.name}" runs for each file but takes no folder.`, 'Mention a folder that goes in, or turn "for each file" off.');
      for (const mentioned of mentions(step.sentence)) {
        if (!sourceOf(doc, window, at, mentioned)) say(`The cell "${step.name}" mentions @${mentioned.name}, which is not an input or the result of a cell before it.`, 'Add the input, move the cell, or take the mention out.');
      }
    });
    for (const one of window.inputs.filter((input) => input.kind === 'from')) {
      const source = doc.windows.find((other) => other.id === one.from?.window);
      if (!source || !source.outputs.some((out) => idOf(out.name) === idOf(one.from?.output ?? ''))) {
        say(`"${one.name}" takes something from a window or an output that is not there.`, 'Pick one of the other windows\' outputs.');
      } else if (source.id === window.id || takesFrom(doc, source.id, window.id)) {
        say(`"${one.name}" would make the window wait for itself.`, 'Take from a window that does not take from this one.');
      }
    }
  }
  return problems;
}

// ---- what the model is told ------------------------------------------------

/**
 * A window, in words, for ✨ to write its cells from: where it sits on the page,
 * what the person puts in, and what room each output has -- in cells, which is
 * all the page keeps of a size. How big a cell is in pixels, the scheme's
 * colours, and what a box can hold are said by the editor around the graph
 * (`frontend/editor/graph/writing/graphContext.ts`, `generationContext.ts`),
 * for every block of the gui alike; this adds only what those cannot: that
 * the blocks are one window, and what the others on the page make.
 */
export function windowContext(doc: Windows, id: string): string {
  const window = doc.windows.find((one) => one.id === id);
  if (!window) return '';
  const lines = [`Window "${window.title}": ${window.span} of 16 cells wide on the page "${doc.name}", ${windowRows(window)} rows tall, and it never grows: what comes out fills the room it is given.`];
  if (window.ask) lines.push(`The person is asked: ${window.ask}`);
  lines.push(`The person puts in: ${window.inputs.map((one) => `${one.name} (${one.kind}${one.kind === 'choice' ? `: ${(one.options ?? []).join(', ')}` : ''})`).join('; ') || 'nothing'}.`);
  for (const one of window.outputs) {
    const piece = outPiece(window, one);
    const made = shownResult(window, one);
    const step = made ? producer(window, made)?.step : undefined;
    // What the block that shows it wants is the block's own to say (its design), the same words every node wired to a block is told.
    const kind = OUT_BLOCK[one.kind];
    const wants = widgetDesign(kind)?.receives(parseWidget({ id: outEnd(window, one), kind }))?.trim().replace(/\.$/, '');
    lines.push(`Comes out: "${one.name}", a ${one.kind} ${piece.cells} x ${piece.rows} cells${made ? `, showing "${made}"` : ''}${step ? `, which the cell "${step.name}" makes` : ''}.${wants ? ` It wants ${wants}.` : ''}`);
  }
  const others = doc.windows.filter((one) => one.id !== id);
  if (others.length) lines.push(`Other windows on the page: ${others.map((one) => `"${one.title}" makes ${one.outputs.map((out) => `"${out.name}"`).join(', ')}`).join('; ')}.`);
  return lines.join('\n');
}

// ---- which windows to run, and in what order -------------------------------
//
// The rule is shared with the page a deployed tool serves, so it lives in `gui/windows/order.ts`; here it is
// asked of a document of windows.

export type { Done } from '../windows/order.ts';

/** The windows of *doc* as the order sees them: each with the windows it takes from. */
const linked = (doc: Windows): Linked[] => doc.windows.map((window) => ({ id: window.id, after: upstream(doc, window.id) }));

/** The windows whose last answer is still the answer to what is on the page. */
export const currentWindows = (doc: Windows, done: Done): Set<string> => orderCurrent(linked(doc), done);

/** The windows to run, in the order to run them, so that *id* answers to what is on the page. */
export const runOrder = (doc: Windows, id: string, done: Done): string[] => orderRun(linked(doc), id, done);

export { afterEdit } from '../windows/order.ts';

/** *done* after window *id* ran. */
export const afterRun = (doc: Windows, done: Done, id: string): Done => orderAfterRun(linked(doc), done, id);

// ---- windows to a graph and a gui ------------------------------------------

/** The sentence as the model reads it: a mention is the name of what it points at. */
const spoken = (sentence: string): string => sentence.replace(/@([\p{L}\p{N}_-]+)(?:\.(path|content|message|history))?/gu, (_, name: string, part?: string) => `"${name}${part && part !== 'content' ? ` ${part}` : ''}"`);

/** What a port is called for the part of a thing a step takes: a file's `path`, a chat's `message` and `history`; the thing itself, nothing. */
const partOf = (part?: string): string => (part && part !== 'content' ? `_${part}` : '');

function stepNodeOf(doc: Windows, window: Window, at: number, y: number): { node: GraphNode; wires: { from: string; fromPort: string; toPort: string }[] } {
  const step = window.steps[at];
  const ports = new Map<string, Port>();
  const wires: { from: string; fromPort: string; toPort: string }[] = [];
  for (const mention of taken(window, at)) {
    const source = sourceOf(doc, window, at, mention);
    if (!source) continue;
    const id = idOf(mention.name) + partOf(mention.part);
    if (ports.has(id)) continue;
    const input = port(id, mention.part && mention.part !== 'content' ? `${mention.name} ${mention.part}` : mention.name, 'input', source.type, source.multi, `What goes into ${source.label}`);
    ports.set(id, source.field ? { ...input, field: source.field } : input);
    wires.push({ from: source.node, fromPort: source.port, toPort: id });
  }
  const config: RawConfig = step.how === 'code' ? { code: step.code ?? '', window: windowFacts(doc, window, step) } : {};
  if (step.each) Object.assign(config, { batch_mode: 'per_item', batch_concurrency: 3 });
  const node: GraphNode = {
    id: stepNode(window, step), node_type: step.how, label: step.name, description: spoken(step.sentence),
    position: { x: 320 + at * 300, y }, inputs: [...ports.values()], config,
    outputs: resultsOf(step).map((name) => port(resultPort(step, name), name, 'output', 'text', step.each === true)),
  };
  return { node, wires };
}

function startNode(window: Window, y: number): GraphNode {
  const start: GraphNode = { id: window.id, node_type: 'start', label: window.title, description: '', position: { x: 0, y }, inputs: [], outputs: [], config: {} };
  Object.assign(start, registry.node('start')!.derivedPorts(start, registry));
  return start;
}

function endNode(window: Window, one: WindowOut, y: number): GraphNode {
  return {
    id: outEnd(window, one), node_type: 'end', label: one.name, description: '', position: { x: 320 + window.steps.length * 300, y },
    inputs: [port('value', 'Value', 'input', 'any', one.kind === 'list' || window.steps.some((step) => step.each))], outputs: [], config: {},
  };
}

/** The blocks of one window, in the order they are drawn: heading, inputs, Run and the first sentence, outputs. */
function blocksOf(doc: Windows, window: Window): RawConfig[] {
  const on = { group: window.id };
  // Where the window stands on the page, among its words: so a tool that is delivered can draw the page it was written as.
  const at = doc.page ? pageOf(doc).findIndex((block) => block.window === window.id) : -1;
  const trigger = window.trigger ?? {};
  const fires = trigger.onChange ? { fires: window.id } : {};
  const taking = (one: WindowIn, w: number, h: number): RawConfig => {
    const id = inBlock(window, one);
    const common = { ...on, id, label: one.name, tone: 'sunken', sends_to: [window.id], ...fires, w, h };
    switch (one.kind) {
      case 'file': return { ...common, kind: 'input_picker', mode: 'file', value: one.value ?? '', extensions: one.extensions ?? '' };
      case 'folder': return { ...common, kind: 'input_picker', mode: 'directory', value: one.value ?? '', extensions: one.extensions ?? '' };
      case 'text': return { ...common, kind: 'text_io', mode: 'input', value: one.value ?? '' };
      case 'number': return { ...common, kind: 'slider', value: one.value ?? one.min ?? 0, min: one.min ?? 0, max: one.max ?? 100, step: one.step ?? 1 };
      case 'choice': return { ...common, kind: 'select', options: (one.options ?? []).join('\n'), value: one.value ?? one.options?.[0] ?? '' };
      default: return { ...on, id, kind: 'text', mode: 'caption', label: '', w, h, tone: 'plain', value: `${one.name}: “${one.from?.output}” from “${doc.windows.find((other) => other.id === one.from?.window)?.title ?? one.from?.window}”` };
    }
  };
  const showing = (one: WindowOut, w: number, h: number): RawConfig => {
    const common = { ...on, id: outEnd(window, one), label: one.name, tone: 'raised', shows: outEnd(window, one), w, h };
    switch (one.kind) {
      case 'table': return { ...common, kind: 'table' };
      case 'chart': return { ...common, kind: 'plot_window' };
      case 'image': return { ...common, kind: 'image_view' };
      case 'chat': return { ...common, kind: 'chat', value: { messages: [], pending: '' }, sends_to: [window.id], fires: window.id };
      default: return { ...common, kind: 'text_io', mode: 'output' };
    }
  };
  const lay = <T>(items: T[], pieces: Piece[], make: (item: T, w: number, h: number) => RawConfig): RawConfig[] => {
    const lines = inLines(pieces, window.span);
    return lines.flat().map((placed, at) => make(items[at], placed.piece.cells, placed.rows));
  };
  const button = hasButton(window);
  const run = button ? Math.min(window.span, Math.max(2, Math.round(window.span / 4))) : 0;
  return [
    { ...on, id: `${window.id}_title`, kind: 'text', mode: 'heading', label: '', w: window.span, h: 1, tone: 'plain', value: window.title, span: window.span, after: upstream(doc, window.id), ...(at >= 0 ? { page_at: at } : {}) },
    ...lay(window.inputs, window.inputs.map((one) => inPiece(window, one)), taking),
    ...(button ? [{ ...on, id: `${window.id}_run`, kind: 'button', label: trigger.label?.trim() || 'Run', w: run, h: 1, tone: 'plain', fires: window.id }] : []),
    ...lay(window.outputs, window.outputs.map((one) => outPiece(window, one)), showing),
  ];
}

/**
 * What a cell that makes a drawing is told of its window, as `node.window` -- plain JSON, written into the settings of its code node
 * (`config.window`) and made again with every graph, so it follows the windows.
 *
 * A function that draws (SVG for a chart, a figure) cannot see the page it draws for: the room it has is what the window gives the
 * output it feeds, and finished SVG is shown as a picture, where the scheme's CSS variables do not reach. So it is told both: the
 * room -- the pixels a drawing has in the block, at the full width of the page (a narrower page scales every cell alike, so a shape
 * drawn for this size keeps its proportions), and the cells it comes from -- and the scheme's colours as values.
 */
export function windowFacts(doc: Windows, window: Window, step: Step): Record<string, unknown> {
  const id = scheme(doc.scheme ?? DEFAULT_SCHEME);
  // A row is one cell high; a window's own padding and border come out of its width, so across, a cell is a little narrower than the page's.
  const across = GUI_MAX_CELL - (2 * (WINDOW_PADDING + WINDOW_BORDER)) / window.span;
  // What is drawn has the block less its card (`BLOCK_CHROME`): that is the room, the number a drawing is made for.
  const wide = (cells: number): number => Math.round(cells * across + (cells - 1) * GUI_GAP - BLOCK_CHROME.width);
  const high = (cells: number): number => cells * GUI_MAX_CELL + (cells - 1) * GUI_GAP - BLOCK_CHROME.height;
  const shows = window.outputs.flatMap((one) => {
    const made = shownResult(window, one);
    if (!made || producer(window, made)?.step !== step) return [];
    const piece = outPiece(window, one);
    return [{ output: one.name, kind: one.kind, result: made, cells: piece.cells, rows: piece.rows, width: wide(piece.cells), height: high(piece.rows) }];
  });
  return {
    id: window.id, title: window.title, span: window.span, rows: windowRows(window),
    page: { name: doc.name, columns: 16, cell: GUI_MAX_CELL, gap: GUI_GAP },
    shows,
    scheme: {
      id: id.id, light: id.light === true, background: id.sunken, surface: id.surface, line: id.line, text: id.text, muted: id.muted,
      accent: id.accent, success: id.success, danger: id.danger, warning: id.warning, series: plotColours(id.id),
    },
  };
}

/**
 * The words of the page as blocks of the gui, each saying where it stands (`page_at`, counted with the windows) and how it is
 * set (`page_style`: a heading, a paragraph, a list, a gap). A document with no page of its own has none: its tool shows
 * its windows under its name.
 */
function noteBlocks(doc: Windows): RawConfig[] {
  if (!doc.page) return [];
  return pageOf(doc).flatMap((block, at): RawConfig[] => (block.kind === 'window' ? [] : [{
    id: `note_${block.id}`, kind: 'text', mode: block.kind === 'h1' || block.kind === 'h2' ? 'heading' : 'body', label: '', w: 16, h: 1, tone: 'plain',
    value: block.kind === 'space' ? '' : block.text ?? '', page_at: at, page_style: block.kind,
  }]));
}

/**
 * Where the windows' nodes stand in the schedule (`graph/schedule.ts`): one row
 * for each window, read left to right as the cells are -- its start point, its
 * cells that do something in the order they stand, what is shown -- so the
 * position says the order and the list and the table are one thing. Outputs
 * after the first stand under it, in the last column.
 *
 * A window that takes from another stands further right, by as little as the
 * rule needs ("every wire ends in a later column than it starts"): the cell
 * that takes is in a later column than the cell that makes.
 */
export function windowsSchedule(doc: Windows, edges: GraphEdge[]): string[] {
  const place = new Map<string, { window: number; column: number }>();
  doc.windows.forEach((window, at) => {
    place.set(window.id, { window: at, column: 0 });
    window.steps.forEach((step, k) => place.set(stepNode(window, step), { window: at, column: k + 1 }));
    window.outputs.forEach((one) => place.set(outEnd(window, one), { window: at, column: window.steps.length + 1 }));
  });
  const shift = doc.windows.map(() => 0);
  for (let pass = 0; pass <= doc.windows.length; pass++) {
    let moved = false;
    for (const edge of edges) {
      const from = place.get(edge.source_node_id);
      const to = place.get(edge.target_node_id);
      if (!from || !to || from.window === to.window) continue;
      const need = shift[from.window] + from.column + 1 - to.column;
      if (need > shift[to.window]) { shift[to.window] = need; moved = true; }
    }
    if (!moved) break;
  }
  const rows: (string | null)[][] = [];
  doc.windows.forEach((window, at) => {
    const first = rows.length;
    const cells = [window.id, ...window.steps.map((step) => stepNode(window, step))];
    rows.push([...new Array<null>(shift[at]).fill(null), ...cells]);
    window.outputs.forEach((one, row) => {
      if (row >= rows.length - first) rows.push([]);
      rows[first + row][shift[at] + window.steps.length + 1] = outEnd(window, one);
    });
  });
  const width = Math.max(0, ...rows.map((row) => row.length));
  return tableLines(rows.map((row) => Array.from({ length: width }, (_, c) => row[c] ?? null)));
}

/**
 * What was written for a step -- its prompt, its code, whatever its kind keeps
 * in files of its own -- is not the windows' to say: it is what a model made
 * of the sentence, and a new sentence is no reason to lose it. So a step of the
 * graph that is made again takes it from the same step of *before*, unless the
 * windows give it a text of their own.
 */
function keepWriting(graph: Graph, before: Graph): void {
  for (const node of graph.nodes) {
    const old = before.nodes.find((one) => one.id === node.id && one.node_type === node.node_type);
    if (!old) continue;
    for (const text of registry.node(node.node_type)?.texts(node) ?? []) {
      if (old.config[text.field] !== undefined && !node.config[text.field]) node.config[text.field] = old.config[text.field];
    }
  }
}

/**
 * The graph and the gui that *doc* says. Ids come from the windows' own, so
 * writing it again after an edit gives the same nodes the files already hold;
 * *before*, the graph those files make, lends each its writing (`keepWriting`).
 *
 * Each window's start point is wired to whatever takes something of what the
 * window's blocks send, which is what makes a round of the window run the
 * window and what it takes from others, and nothing else. A window that takes
 * nothing of its own has no input to wire, so its start point opens the first
 * cell's ◆ instead.
 */
export function windowsToGraph(doc: Windows, before?: Graph): Graph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const wire = (from: string, fromPort: string, to: string, toPort: string): void => {
    const edge = { id: '', source_node_id: from, source_port_id: fromPort, target_node_id: to, target_port_id: toPort };
    edges.push({ ...edge, id: wireOf(edge) });
  };
  doc.windows.forEach((window, index) => {
    const y = index * 260;
    nodes.push(startNode(window, y));
    let started = false;
    window.steps.forEach((_, at) => {
      const made = stepNodeOf(doc, window, at, y + at * 70);
      nodes.push(made.node);
      for (const one of made.wires) { wire(one.from, one.fromPort, made.node.id, one.toPort); started = started || one.from === window.id; }
    });
    if (!started && window.steps.length) wire(window.id, START_PORT, stepNode(window, window.steps[0]), RUN_PORT);
    window.outputs.forEach((one, row) => {
      nodes.push(endNode(window, one, y + row * 110));
      const made = shownResult(window, one);
      const from = made ? producer(window, made) : undefined;
      if (from) wire(from.node, from.port, outEnd(window, one), 'value');
    });
  });
  const graph: Graph = {
    metadata: { name: doc.name, description: doc.description, gui_scheme: doc.scheme ?? DEFAULT_SCHEME },
    nodes,
    edges,
    gui: { blocks: [...doc.windows.flatMap((window) => blocksOf(doc, window)), ...noteBlocks(doc)] },
  };
  graph.schedule = windowsSchedule(doc, edges);
  if (before) keepWriting(graph, before);
  return graph;
}
