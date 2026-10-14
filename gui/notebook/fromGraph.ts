// The windows a graph says: `windowsToGraph` (`windows.ts`) read backwards.
//
// The principle: what is *executed* is the graph -- nodes, wires, schedule -- and what is *shown* is the gui; the page of the notebook
// is those two, read as windows. A window is a row of the schedule (its start point, the cells that do something, what is shown), its
// inputs and outputs are the gui's blocks that send to that start point and show those end points, and the words of the page are text
// blocks that say where they stand (`page_at`). The `@Name` of a sentence is no more than the way the notebook *writes* a wire: the wire
// is stored as a wire, and the chip is drawn from the ports the node has. So nothing is kept twice, and a notebook has no file of its own.
//
// What a window says that a graph has no place for is kept beside the node or the block it belongs to, in a word of its own: the
// window's `ask` is the words of its start point, `config.notebook` of a cell holds a sentence that would not come back from what a
// model is told and the code a model's cell was switched away from, and a block keeps `own_rows`, `list`, `from_window` and
// `from_output`. Reading prefers them where they still say what the node or the block says.
//
// Authoring only, and the notebook's: it knows what the notebook's compiler writes. `backend/notebook/fromGraph.test.ts` holds the round trip.

import type { Graph, GraphNode, RawConfig } from '../../graph/graph.ts';
import { registry } from '../../graph/nodes/registry.ts';
import { parseTable } from '../../graph/schedule.ts';
import { DEFAULT_SCHEME, spoken, unspoken, type BlockKind, type OutKind, type PageBlock, type Step, type Trigger, type Window, type WindowIn, type WindowOut, type Windows } from './windows.ts';

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const count = (value: unknown, otherwise: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : otherwise);

/** What the notebook keeps beside a cell (`stepNodeOf` in `windows.ts`). */
const ownOf = (node: GraphNode): { sentence?: unknown; code?: unknown } => {
  const own = node.config.notebook;
  return own && typeof own === 'object' ? own : {};
};

/**
 * The sentence a cell was written as. The graph keeps what a model is told -- a mention as the name of what it points at, in quotes
 * (`spoken`) -- and the ports the cell takes; a quoted name that is one of those ports is the mention it came from. Where that does
 * not give the sentence back, the node holds it as written -- and it is used while it still says what the node says, so a cell worded
 * differently somewhere else is read as it is worded there.
 */
function sentenceOf(node: GraphNode): string {
  const kept = ownOf(node).sentence;
  if (typeof kept === 'string' && spoken(kept) === node.description) return kept;
  return unspoken(node.description, node.inputs.map((one) => one.name));
}

/** Who does a cell, by the type of the node that does it; a node of any other type is not a cell. */
const HOW: Record<string, Step['how'] | undefined> = { ai: 'ai', code: 'code' };

// What a node is in a window is asked of its kind, as the shells do (`backend/architecture/shells.test.ts`): a start point takes
// the package a window's blocks send, an end point is a result.
const startsWindow = (node: GraphNode): boolean => registry.node(node.node_type)?.takesPackage === true;
const endsWindow = (node: GraphNode): boolean => registry.node(node.node_type)?.isResult === true;

function stepOf(node: GraphNode, how: Step['how']): Step {
  const results = node.outputs.map((one) => one.name);
  // A model's cell has no code of its own in the graph; the one it was switched away from is kept beside it.
  const code = how === 'code' ? text(node.config.code) : text(ownOf(node).code);
  return {
    name: node.label,
    sentence: sentenceOf(node),
    how,
    ...(code ? { code } : {}),
    ...(node.config.batch_mode === 'per_item' ? { each: true } : {}),
    ...(how === 'code' && (results.length !== 1 || results[0] !== node.label) ? { results } : {}),
  };
}

// ---- how wide, how tall ----------------------------------------------------

/** The shares of a line the notebook offers a width as (`SHARES` of the list). */
const SHARES = [1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 1];
const cellsOf = (span: number, width: number): number => Math.min(span, Math.max(1, Math.round(width * span)));

/**
 * A width as the share of its line the cells say it is: the nearest one the notebook offers that makes the same cells, else the
 * cells' own fraction; none for the whole line, which is what a width left out means.
 */
function shareOf(cells: number, span: number): number | undefined {
  if (cells >= span) return undefined;
  const near = SHARES.reduce((best, one) => (Math.abs(one - cells / span) < Math.abs(best - cells / span) ? one : best));
  const share = cellsOf(span, near) === cells ? near : cells / span;
  return share >= 1 ? undefined : share;
}

// ---- inputs ----------------------------------------------------------------

/** What a caption block of an input that takes another window's output says: `Name: “output” from “Title”`. Read where the block says no more. */
const FROM = /^(.*?): “(.*)” from “(.*)”$/s;

function inputOf(block: RawConfig, span: number, windowOfTitle: (title: string) => string | undefined): WindowIn {
  const share = shareOf(count(block.w, span), span);
  const common = { name: text(block.label), ...(share !== undefined ? { width: share } : {}), ...(typeof block.own_rows === 'number' ? { rows: block.own_rows } : {}) };
  const value = block.value;
  switch (block.kind) {
    case 'input_picker':
      return { ...common, kind: block.mode === 'directory' ? 'folder' : 'file', ...(text(value) ? { value: text(value) } : {}), ...(text(block.extensions) ? { extensions: text(block.extensions) } : {}) };
    case 'text_io':
      return { ...common, kind: 'text', ...(text(value) ? { value: text(value) } : {}) };
    case 'slider': {
      // What a number input says is what differs from the ordinary: from 0 to 100, by 1, starting at its lowest.
      const min = count(block.min, 0);
      const max = count(block.max, 100);
      const step = count(block.step, 1);
      const start = count(value, min);
      return { ...common, kind: 'number', ...(min !== 0 ? { min } : {}), ...(max !== 100 ? { max } : {}), ...(step !== 1 ? { step } : {}), ...(start !== min ? { value: start } : {}) };
    }
    case 'select': {
      const options = text(block.options).split('\n');
      return { ...common, kind: 'choice', options, ...(text(value) && text(value) !== options[0] ? { value: text(value) } : {}) };
    }
    default: {
      const said = FROM.exec(text(value));
      const window = text(block.from_window) || (said ? windowOfTitle(said[3]) : undefined);
      const output = text(block.from_output) || said?.[2];
      return { ...common, name: said?.[1] ?? common.name, kind: 'from', ...(window && output ? { from: { window, output } } : {}) };
    }
  }
}

// ---- outputs ---------------------------------------------------------------

const OUT_KINDS: Record<string, OutKind> = { table: 'table', plot_window: 'chart', image_view: 'image', chat: 'chat' };

/**
 * Whether a text block shows a text or a list. The block says (`list`); for a block that does not, a text and a list are one block and
 * one end point that takes a list where a window runs a cell for each file, and what tells them apart is what a cell of code that
 * draws is told of the room it draws for (`node.window.shows`).
 */
function textOrList(block: RawConfig | undefined, from: GraphNode | undefined, end: GraphNode): OutKind {
  if (typeof block?.list === 'boolean') return block.list ? 'list' : 'text';
  const shows = Array.isArray((from?.config.window as { shows?: unknown } | undefined)?.shows) ? (from!.config.window as { shows: { output?: unknown; kind?: unknown }[] }).shows : [];
  const told = shows.find((one) => one.output === end.label)?.kind;
  if (told === 'text' || told === 'list') return told;
  return end.inputs[0]?.multi ? 'list' : 'text';
}

function outputOf(end: GraphNode, block: RawConfig | undefined, span: number, graph: Graph, steps: Map<string, Step>, last: Step | undefined): WindowOut {
  // The result an output shows is the node the wire into it starts at, by the name of the port it leaves: said only where it is not the last cell's first.
  const wire = graph.edges.find((edge) => edge.target_node_id === end.id && edge.target_port_id === 'value');
  const from = wire ? graph.nodes.find((node) => node.id === wire.source_node_id) : undefined;
  const kind: OutKind = OUT_KINDS[text(block?.kind)] ?? textOrList(block, from, end);
  const made = from && steps.has(from.id) ? from.outputs.find((one) => one.id === wire!.source_port_id)?.name : undefined;
  const usual = last ? (last.results?.[0] ?? last.name) : undefined;
  const share = shareOf(count(block?.w, span), span);
  return {
    name: end.label, kind,
    // As tall as the block, unless it stands in a taller line and says how tall it was made.
    rows: typeof block?.own_rows === 'number' ? block.own_rows : count(block?.h, 1),
    ...(share !== undefined ? { width: share } : {}),
    ...(made && made !== usual ? { of: made } : {}),
  };
}

// ---- the page --------------------------------------------------------------

/** The words of the page and the windows among them, in the order `page_at` says; none where the gui says none. */
function pageOf(graph: Graph): PageBlock[] | undefined {
  const placed: { at: number; block: PageBlock }[] = [];
  for (const block of graph.gui?.blocks ?? []) {
    if (typeof block.page_at !== 'number') continue;
    const id = text(block.id);
    if (id.startsWith('note_') && block.page_style) {
      const kind = text(block.page_style) as BlockKind;
      placed.push({ at: block.page_at, block: { id: id.slice('note_'.length), kind, ...(kind === 'space' ? {} : { text: text(block.value) }) } });
    } else if (id.endsWith('_title') && block.group) {
      placed.push({ at: block.page_at, block: { id: `w_${text(block.group)}`, kind: 'window', window: text(block.group) } });
    }
  }
  return placed.length ? placed.sort((a, b) => a.at - b.at).map((one) => one.block) : undefined;
}

// ---- the windows -----------------------------------------------------------

/**
 * The windows of *graph*: the rows of its schedule that start at a start point with a window's heading in the gui (a start point
 * without one is some other graph's). A row below one that starts none -- more outputs than the window has rows -- is the same
 * window's, and what it holds that is not shown is nobody's: a graph with more in it than the windows make is told by making it again.
 */
export function graphToWindows(graph: Graph): Windows {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const blocks = graph.gui?.blocks ?? [];
  const headed = (node: GraphNode): boolean => startsWindow(node) && blocks.some((block) => block.id === `${node.id}_title`);
  const groups: { start: GraphNode; first: GraphNode[]; below: GraphNode[][] }[] = [];
  for (const row of parseTable(graph.schedule ?? [])) {
    const cells = row.flatMap((id) => (id !== null && nodes.has(id) ? [nodes.get(id)!] : []));
    const start = cells.find(headed);
    if (start) groups.push({ start, first: cells, below: [] });
    else if (groups.length && cells.length && !cells.some(startsWindow)) groups[groups.length - 1].below.push(cells);
  }
  const idOfTitle = (title: string): string | undefined => groups.find((group) => group.start.label === title)?.start.id;

  const windows = groups.map(({ start, first, below }): Window => {
    const mine = blocks.filter((block) => block.group === start.id);
    const span = count(mine.find((block) => block.id === `${start.id}_title`)?.span, 12);
    const steps = first.filter((node) => HOW[node.node_type]);
    const made = steps.map((node) => stepOf(node, HOW[node.node_type]!));
    const byId = new Map(steps.map((node, k) => [node.id, made[k]]));
    const taking = mine.filter((block) => text(block.id).startsWith(`${start.id}_in_`));
    const outputs = [...first, ...below.flat()].filter(endsWindow)
      .map((end) => outputOf(end, mine.find((block) => block.shows === end.id), span, graph, byId, made[made.length - 1]));
    const button = mine.find((block) => block.id === `${start.id}_run`);
    const trigger: Trigger = {
      ...(!button && !outputs.some((one) => one.kind === 'chat') ? { button: false } : {}),
      ...(taking.some((block) => block.fires === start.id) ? { onChange: true } : {}),
      ...(text(button?.label) && text(button?.label) !== 'Run' ? { label: text(button?.label) } : {}),
    };
    const ask = start.description.trim();
    return {
      id: start.id, title: start.label, span,
      inputs: taking.map((block) => inputOf(block, span, idOfTitle)),
      steps: made, outputs,
      ...(Object.keys(trigger).length ? { trigger } : {}),
      ...(ask ? { ask } : {}),
    };
  });

  const page = pageOf(graph);
  const scheme = graph.metadata.gui_scheme;
  return {
    name: graph.metadata.name, description: graph.metadata.description,
    ...(scheme && scheme !== DEFAULT_SCHEME ? { scheme } : {}),
    windows,
    ...(page ? { page } : {}),
  };
}
