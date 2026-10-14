// The windows a graph says: `windowsToGraph` (`windows.ts`) read backwards.
//
// The principle: what is *executed* is the graph -- nodes, wires, schedule -- and what is *shown* is the gui; the page of the notebook
// is those two, read as windows. A window is a row of the schedule (its start point, the cells that do something, what is shown), its
// inputs and outputs are the gui's blocks that send to that start point and show those end points, and the words of the page are text
// blocks that say where they stand (`page_at`). The `@Name` of a sentence is no more than the way the notebook *writes* a wire: the wire
// is stored as a wire, and the chip is drawn from the ports the node has. So nothing is kept twice, and a notebook has no file of its own.
//
// Authoring only, and the notebook's: it knows what the notebook's compiler writes. What it cannot read back is told in
// `backend/notebook/fromGraph.test.ts`, which holds the round trip.

import type { Graph, GraphNode, Port, RawConfig } from '../../graph/graph.ts';
import { registry } from '../../graph/nodes/registry.ts';
import { parseTable } from '../../graph/schedule.ts';
import { DEFAULT_SCHEME, type BlockKind, type OutKind, type PageBlock, type Step, type Trigger, type Window, type WindowIn, type WindowOut, type Windows } from './windows.ts';

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const count = (value: unknown, otherwise: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : otherwise);

/** A port's name as a mention: `File` is `@File`, `Chat message` is `@Chat.message` (a part of a thing, which a name never has a space for). */
function mentionOf(port: Port): string {
  const part = /^(\S+) (path|message|history)$/.exec(port.name);
  return part ? `@${part[1]}.${part[2]}` : `@${port.name}`;
}

/**
 * The sentence a cell was written as. The graph keeps what a model is told -- a mention as the name of what it points at, in quotes
 * (`spoken`) -- and the ports the cell takes; a quoted name that is one of those ports is the mention it came from. A cell that
 * took everything before it has ports and no quotes: its sentence is the description as it stands.
 */
function sentenceOf(node: GraphNode): string {
  let sentence = node.description;
  for (const port of node.inputs) sentence = sentence.split(`"${port.name}"`).join(mentionOf(port));
  return sentence;
}

/** Who does a cell, by the type of the node that does it; a node of any other type is not a cell. */
const HOW: Record<string, Step['how'] | undefined> = { ai: 'ai', code: 'code' };

// What a node is in a window is asked of its kind, as the shells do (`backend/architecture/shells.test.ts`): a start point takes
// the package a window's blocks send, an end point is a result.
const startsWindow = (node: GraphNode): boolean => registry.node(node.node_type)?.takesPackage === true;
const endsWindow = (node: GraphNode): boolean => registry.node(node.node_type)?.isResult === true;

function stepOf(node: GraphNode, how: Step['how']): Step {
  const code = how === 'code';
  const results = node.outputs.map((one) => one.name);
  return {
    name: node.label,
    sentence: sentenceOf(node),
    how,
    ...(code ? { code: text(node.config.code) } : {}),
    ...(node.config.batch_mode === 'per_item' ? { each: true } : {}),
    ...(code && (results.length !== 1 || results[0] !== node.label) ? { results } : {}),
  };
}

/** What a caption block of an input that takes another window's output says: `Name: “output” from “Title”`. */
const FROM = /^(.*?): “(.*)” from “(.*)”$/s;

function inputOf(block: RawConfig, span: number, windowOfTitle: (title: string) => string | undefined): WindowIn {
  const common = { name: text(block.label), width: count(block.w, span) / span, rows: count(block.h, 1) };
  const value = block.value;
  switch (block.kind) {
    case 'input_picker':
      return { ...common, kind: block.mode === 'directory' ? 'folder' : 'file', ...(text(value) ? { value: text(value) } : {}), ...(text(block.extensions) ? { extensions: text(block.extensions) } : {}) };
    case 'text_io':
      return { ...common, kind: 'text', ...(text(value) ? { value: text(value) } : {}) };
    case 'slider':
      return { ...common, kind: 'number', min: count(block.min, 0), max: count(block.max, 100), step: count(block.step, 1), value: count(value, 0) };
    case 'select':
      return { ...common, kind: 'choice', options: text(block.options).split('\n'), value: text(value) };
    default: {
      const said = FROM.exec(text(value));
      const window = said ? windowOfTitle(said[3]) : undefined;
      return { ...common, name: said?.[1] ?? common.name, kind: 'from', ...(said && window ? { from: { window, output: said[2] } } : {}) };
    }
  }
}

const OUT_KINDS: Record<string, OutKind> = { table: 'table', plot_window: 'chart', image_view: 'image', chat: 'chat' };

/**
 * A text and a list are one block and one end point that takes a list where a window runs a cell for each file; what tells them apart is
 * what a cell that draws is told of the room it draws for (), and so only a cell of code says.
 */
function toldKind(from: GraphNode | undefined, end: GraphNode): OutKind | undefined {
  const shows = from && Array.isArray((from.config.window as { shows?: unknown } | undefined)?.shows) ? (from.config.window as { shows: { output?: unknown; kind?: unknown }[] }).shows : [];
  const kind = shows.find((one) => one.output === end.label)?.kind;
  return kind === 'text' || kind === 'list' ? kind : undefined;
}

function outputOf(end: GraphNode, block: RawConfig | undefined, span: number, graph: Graph, steps: Map<string, Step>, last: Step | undefined): WindowOut {
  // The result an output shows is the node the wire into it starts at, by the name of the port it leaves: said only where it is not the last cell's first.
  const wire = graph.edges.find((edge) => edge.target_node_id === end.id && edge.target_port_id === 'value');
  const from = wire ? graph.nodes.find((node) => node.id === wire.source_node_id) : undefined;
  const kind: OutKind = OUT_KINDS[text(block?.kind)] ?? toldKind(from, end) ?? (end.inputs[0]?.multi ? 'list' : 'text');
  const made = from && steps.has(from.id) ? from.outputs.find((one) => one.id === wire!.source_port_id)?.name : undefined;
  const usual = last ? (last.results?.[0] ?? last.name) : undefined;
  return {
    name: end.label, kind, rows: count(block?.h, 1), width: count(block?.w, span) / span,
    ...(made && made !== usual ? { of: made } : {}),
  };
}

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

/**
 * The windows of *graph*. Windows are the rows of its schedule that start at a start point; a row below it that starts none -- more
 * outputs than the window has rows -- is the same window's.
 */
export function graphToWindows(graph: Graph): Windows {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const blocks = graph.gui?.blocks ?? [];
  const rows: string[][][] = [];
  for (const row of parseTable(graph.schedule ?? [])) {
    const cells = row.filter((id): id is string => id !== null && nodes.has(id));
    if (cells.some((id) => startsWindow(nodes.get(id)!))) rows.push([cells]);
    else if (rows.length && cells.length) rows[rows.length - 1].push(cells);
  }
  const starts = rows.map((group) => nodes.get(group[0].find((id) => startsWindow(nodes.get(id)!))!)!);
  const idOfTitle = (title: string): string | undefined => starts.find((start) => start.label === title)?.id;

  const windows = rows.map((group, at): Window => {
    const start = starts[at];
    const mine = blocks.filter((block) => block.group === start.id);
    const span = count(mine.find((block) => block.id === `${start.id}_title`)?.span, 12);
    const cells = group.flat().map((id) => nodes.get(id)!);
    const steps = cells.filter((node) => HOW[node.node_type]);
    const made = steps.map((node) => stepOf(node, HOW[node.node_type]!));
    const byId = new Map(steps.map((node, k) => [node.id, made[k]]));
    const taking = mine.filter((block) => text(block.id).startsWith(`${start.id}_in_`));
    const outputs = cells.filter(endsWindow)
      .map((end) => outputOf(end, mine.find((block) => block.shows === end.id), span, graph, byId, made[made.length - 1]));
    const button = mine.find((block) => block.id === `${start.id}_run`);
    const trigger: Trigger = {
      ...(!button && !outputs.some((one) => one.kind === 'chat') ? { button: false } : {}),
      ...(taking.some((block) => block.fires === start.id) ? { onChange: true } : {}),
      ...(text(button?.label) && text(button?.label) !== 'Run' ? { label: text(button?.label) } : {}),
    };
    return {
      id: start.id, title: start.label, span,
      inputs: taking.map((block) => inputOf(block, span, idOfTitle)),
      steps: made, outputs,
      ...(Object.keys(trigger).length ? { trigger } : {}),
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

