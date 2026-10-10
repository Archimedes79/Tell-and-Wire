// A page drawn from the graph: the blocks it still lacks.
//
// A tool built as a graph has start points that read things and end points that
// hand things back, and a page is where a person meets them -- so a first page
// needs no model: an input block for each thing a start point reads, a button
// that starts it, a text output for each end point nobody shows. What a start
// point reads is what the nodes wired to it take of its package, each by the
// field it names (`Port.field`); one that takes the whole package names none,
// and no block can be made for what nothing says. Each block is sent under
// that name -- it is its id -- so the input finds what the person gave.
//
// A start point is started by the page or by a call, never both: one a call
// starts is put on the page only if the person says so (`Planned.ifSwitched`),
// since it then stops serving the command line.

import type { DataType, GraphNode, GuiWidget, Wire } from '../../app/graph';
import { blockCan, blocksAt } from '../../app/document/page';
import { registry as runnerRegistry } from '../../../graph/nodes/registry.ts';
import { GUI_GRID_COLUMNS } from '../../app/document/layout';
import { ALL_ENTRIES, newBlock } from './DesignerPalette';

/** The blocks a start point or an end point would get. */
interface Made {
  /** The point they belong to. */
  point: GraphNode;
  blocks: GuiWidget[];
}

/** What a page lacks: blocks to add now, and blocks for start points a call starts, which only a switch to the page serves. */
interface Planned {
  now: Made[];
  ifSwitched: Made[];
}

/** One thing a start point reads: a value of its package, by the name it is sent under -- `file`, of `file.content` -- and what the first input to take it is. */
interface Read {
  name: string;
  /** `content`: the part of it that input takes, where it takes one. */
  part?: string;
  type: DataType;
  list: boolean;
}

/** What the nodes wired to start point *start* take of its package, each value once. */
function readsOf(start: GraphNode, nodes: GraphNode[], edges: Wire[]): Read[] {
  const reads = new Map<string, Read>();
  for (const edge of edges) {
    if (edge.source !== start.id) continue;
    const input = nodes.find((node) => node.id === edge.target)?.inputs.find((port) => port.id === edge.targetHandle);
    const [name, part] = (input?.field ?? '').split('.');
    if (!input || !name || reads.has(name)) continue;
    reads.set(name, { name, part, type: input.data_type, list: input.multi });
  }
  return [...reads.values()];
}

/**
 * The block that sends *read*. Of a part of a value, the kind whose value has
 * one by that name -- `content` of a chosen file, `message` of a chat -- and
 * none where no kind's does. Of a whole value: a picker for a path, sent as it
 * is -- the input reads the file there, or the files of a folder --, a text
 * box for the rest.
 */
function sending(read: Read, taken: GuiWidget[]): GuiWidget | undefined {
  const { part } = read;
  if (part) return ALL_ENTRIES.map((entry) => newBlock(entry.kind, entry.mode, taken)).find((block) => blockCan(block).sends?.keys?.[part]);
  if (read.type !== 'file_path') return newBlock('text_io', 'input', taken);
  return read.list ? newBlock('input_picker', 'directory', taken) : { ...newBlock('input_picker', 'file', taken), send: 'path' };
}

/**
 * How wide and how tall inputs and their button stand, so a first page needs no
 * resizing: inputs share a row, two to a row, a lone one has it to itself, and
 * the button sits beside the last input if there is room, else on its own row.
 * A block that is the whole width by default -- a conversation -- stays so.
 */
function arranged(blocks: GuiWidget[], button?: GuiWidget): GuiWidget[] {
  const inputs = blocks.filter((block) => block !== button);
  const items = [...inputs, ...(button ? [button] : [])];
  const whole = (block: GuiWidget) => (block.w ?? 0) >= GUI_GRID_COLUMNS;
  const width = new Map<GuiWidget, number>(items.map((block) => [block, block === button ? 4 : whole(block) ? GUI_GRID_COLUMNS : 8]));
  // Rows of at most sixteen cells, filled in order.
  const rows: GuiWidget[][] = [];
  for (const block of items) {
    const row = rows[rows.length - 1];
    if (row && row.reduce((sum, one) => sum + width.get(one)!, 0) + width.get(block)! <= GUI_GRID_COLUMNS) row.push(block);
    else rows.push([block]);
  }
  // What is left of a row goes to its first input; a button alone stays a button's size.
  for (const row of rows) {
    if (row.length === 1 && row[0] === button) { width.set(button, 6); continue; }
    const spare = GUI_GRID_COLUMNS - row.reduce((sum, one) => sum + width.get(one)!, 0);
    const first = row.find((one) => one !== button) ?? row[0];
    width.set(first, width.get(first)! + spare);
  }
  // A block that is tall by default -- a text box -- has room for a few lines, a lone one for more.
  return items.map((block) => ({
    ...block,
    w: width.get(block),
    ...((block.h ?? 1) > 1 && !whole(block) ? { h: inputs.length === 1 ? 3 : 2 } : {}),
  }));
}

/**
 * The blocks start point *start* gets: an input for each thing it reads, all
 * sending to it. With one input that can start it, using it does; with several,
 * or none, a button does, once they are filled in. Each is named for what it
 * reads: what a block sends goes in the package under its id, which is what the
 * input takes it by -- so a start point that was started by a call, and reads
 * `topic` of what the call sends, keeps reading it. The button is named for the
 * start point.
 */
function blocksForStart(start: GraphNode, nodes: GraphNode[], edges: Wire[], taken: GuiWidget[]): GuiWidget[] {
  const made: GuiWidget[] = [];
  const next = () => [...taken, ...made];
  for (const read of readsOf(start, nodes, edges)) {
    const block = sending(read, next());
    if (!block) continue;
    const words = read.name.replace(/_/g, ' ');
    // A name another block has already is not its: the input then reads what that block sends, or nothing.
    const id = next().some((other) => other.id === read.name) ? block.id : read.name;
    made.push({ ...block, id, label: words.charAt(0).toUpperCase() + words.slice(1), sends_to: [start.id] });
  }
  // Starting it is something the person does: with one input, using it; else a button.
  if (made.length === 1 && blockCan(made[0]).fires) {
    made[0] = { ...made[0], fires: start.id };
    return arranged(made);
  }
  const button = { ...newBlock('button', undefined, next()), label: start.label || start.id, fires: start.id };
  return arranged([...made, button], button);
}

/**
 * What each end point shows gets a raised box -- two to a row, an odd one last
 * across the whole row -- under a rule that sets it off from the inputs, where
 * there are some.
 */
function outputsLaidOut(planned: Planned, page: GuiWidget[]): void {
  const shown = planned.now.filter((made) => made.blocks.some((block) => block.shows));
  const taken = [...page, ...planned.now.flatMap((made) => made.blocks)];
  const inputs = page.length > 0 || planned.now.some((made) => !made.blocks.some((block) => block.shows));
  shown.forEach((made, index) => {
    const alone = shown.length % 2 === 1 && index === shown.length - 1;
    const laid = made.blocks.map((block) => ({ ...block, w: alone ? GUI_GRID_COLUMNS : GUI_GRID_COLUMNS / 2, h: 6, tone: 'raised' as const }));
    const rule = index === 0 && inputs ? [newBlock('divider', undefined, taken)] : [];
    taken.push(...rule);
    made.blocks = [...rule, ...laid];
  });
}

/**
 * What the page lacks of what *nodes* offer: for each start point nothing on
 * the page sends to or fires, its blocks; for each end point nothing shows, a
 * text output. A start point set to start itself, on a clock, has none: the
 * page cannot start it. Pure: the person is asked about the ones a call
 * starts before any of it is applied.
 */
export function pageFromGraph(nodes: GraphNode[], edges: Wire[], page: GuiWidget[]): Planned {
  const planned: Planned = { now: [], ifSwitched: [] };
  const taken = [...page];
  for (const node of nodes) {
    const element = runnerRegistry.node(node.node_type);
    const by = element?.startedBy(node as never);
    if (by === 'page' || by === 'call') {
      const used = blocksAt(page, node.id);
      if (used.send.length || used.fire.length) continue;
      const blocks = blocksForStart(node, nodes, edges, taken);
      taken.push(...blocks);
      (by === 'page' ? planned.now : planned.ifSwitched).push({ point: node, blocks });
    } else if (element?.isResult && !blocksAt(page, node.id).show.length) {
      const output = newBlock('text_io', 'output', taken);
      const blocks = [{ ...output, label: element.resultLabel(node as never), shows: node.id }];
      taken.push(...blocks);
      planned.now.push({ point: node, blocks });
    }
  }
  // What the person fills in comes first, what comes back after it.
  planned.now.sort((a, b) => Number(a.blocks.some((block) => block.shows)) - Number(b.blocks.some((block) => block.shows)));
  outputsLaidOut(planned, page);
  return planned;
}
