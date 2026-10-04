// The files a node's input definition is written from.
//
// ✨ Input is shown the start of real files -- examples, a spec -- and writes
// the general format of what arrives, and one small example of it, from them:
// so a CSV node's input.js says the columns the file has, not ones a model
// imagined. They are the node's own `input_files` when someone gave it some
// (📂, a drop, ⟳), and otherwise the one the graph hands a file-reading input
// of the node: what the last run brought there, what the node wired to it
// holds -- a path a data node stores -- or, from a start point, the file a
// block of the page that sends into it starts on.

import type { ExecutionResult, Graph, GraphNode, GuiWidget, Wire } from '@/graph';
import { call } from '@/api/client';
import { NODE_BUILDERS } from '@/elements/registry';
import { filesOf } from '@/document/givenFiles';
import { blockCan, blocksAt, startsOn } from '@/document/page';
import { lastRunInputs } from './generationContext';
import { fieldOf } from '@engine/execution/executor.ts';
import { filePorts } from '@engine/execution/fileInputs.ts';
import { registry as engineRegistry } from '@engine/elements/registry.ts';

/** A path in *value*: a text, or the first text of a list. */
function firstPath(value: unknown): string | undefined {
  const one = Array.isArray(value) ? value.find((item) => typeof item === 'string' && item.trim()) : value;
  return typeof one === 'string' && one.trim() ? one.trim() : undefined;
}

/**
 * The file start point *start* is sent, for an input that takes *field* of
 * it: what the block of the page the field names starts on -- or, without a
 * field, the one block that sends to it -- else the path at *field* of what a
 * call sends it, for example. Not a folder's: a list of files is no one
 * example.
 */
function sentFile(start: GraphNode, page: GuiWidget[], field: string | undefined): string | undefined {
  const senders = blocksAt(page, start.id).send;
  const block = field ? senders.find((widget) => widget.id === field.split('.')[0]) : senders.length === 1 ? senders[0] : undefined;
  if (block) return blockCan(block).sends?.list ? undefined : firstPath(startsOn(block));
  const example = start.config.values;
  return field && example && typeof example === 'object' ? firstPath(fieldOf(example, field)) : undefined;
}

/**
 * The file the graph hands one of *node*'s file-reading inputs, without
 * running anything -- or undefined. Which inputs read their file is the
 * engine's own rule (`filePorts`): the ones ticked "Read the file at this
 * path", of a kind that reads its files.
 */
function graphFileOf(node: GraphNode, nodes: GraphNode[], edges: Wire[], result: ExecutionResult | null, page: GuiWidget[]): string | undefined {
  const ports = filePorts(node, engineRegistry);
  const last = lastRunInputs(node.id, result);
  for (const port of ports) {
    const path = firstPath(last?.[port]);
    if (path) return path;
  }
  for (const port of ports) {
    for (const edge of edges) {
      if (edge.target !== node.id || edge.targetHandle !== port || !edge.sourceHandle) continue;
      const source = nodes.find((candidate) => candidate.id === edge.source);
      const field = node.inputs.find((input) => input.id === port)?.field;
      const path = source && (firstPath(NODE_BUILDERS[source.node_type]?.restingValue(source, edge.sourceHandle)) ?? sentFile(source, page, field));
      if (path) return path;
    }
  }
  return undefined;
}

/** The files ✨ Input writes from: the node's own, else the one the graph hands it -- a file picked on *page*, too. */
export function inputFilesOf(node: GraphNode, nodes: GraphNode[], edges: Wire[], result: ExecutionResult | null, page: GuiWidget[] = []): string[] {
  const own = filesOf(node, 'input');
  if (own.length) return own;
  const graphs = graphFileOf(node, nodes, edges, result, page);
  return graphs ? [graphs] : [];
}

/**
 * "⟳ From the graph": the file the graph hands one of *node*'s file-reading
 * inputs -- without running anything where it can say, and otherwise what the
 * nodes that feed it deliver when they are run now (the node itself is not).
 * *graph* is the canvas as the panel asking holds it.
 */
export async function fileFromTheGraph(
  node: GraphNode, nodes: GraphNode[], edges: Wire[], result: ExecutionResult | null, graph: () => Graph,
): Promise<string | undefined> {
  const known = graphFileOf(node, nodes, edges, result, graph().page?.blocks ?? []);
  const ports = filePorts(node, engineRegistry);
  if (known || !ports.length) return known;
  const got = await call('nodeInputs', { ...graph(), node_id: node.id });
  if (got.error) throw new Error(`What feeds it failed: ${got.error}`);
  for (const port of ports) {
    const path = firstPath(got.inputs[port]);
    if (path) return path;
  }
  return undefined;
}
