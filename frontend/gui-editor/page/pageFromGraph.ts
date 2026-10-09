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
import { ALL_ENTRIES, newBlock } from './DesignerPalette';

/** The blocks a start point or an end point would get. */
interface Made {
  /** The point they belong to. */
  point: GraphNode;
  blocks: GuiWidget[];
}

/** What a page lacks: blocks to add now, and blocks for start points a call starts, which only a switch to the page serves. */
export interface Planned {
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
  if (made.length === 1 && blockCan(made[0]).fires) made[0] = { ...made[0], fires: start.id };
  else made.push({ ...newBlock('button', undefined, next()), label: start.label || start.id, fires: start.id });
  return made;
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
  return planned;
}
