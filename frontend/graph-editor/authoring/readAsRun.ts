// Files, read the way a run reads them.
//
// A data node can hold what a file says, and a folder listing shows the files
// it lists. Each of those is a read, and each is done by the node's own
// runner, run on its own by the route a run of one node uses (`runNode`): the same
// path resolved against the same folder, the same text read, the same
// extensions and recursion applied to a listing. A second way of reading a
// file here would be a second answer to "what does the node get".

import type { GraphNode, GuiWidget, NodeResult } from '../../app/graph';
import { call } from '../../app/api/client';
import { NODE_KINDS } from '../../app/document/nodeKinds';
import { derivedNodePorts } from '../../app/document/ports';
import { useGraphStore } from '../../app/store/graphStore';

/**
 * A node, run by itself: nothing else of the graph is sent or run, with the
 * graph's metadata as a run has it.
 */
function runAlone(node: GraphNode, inputs: Record<string, unknown>): Promise<NodeResult> {
  const graph = { metadata: useGraphStore.getState().metadata, nodes: [node], edges: [] };
  return call('runNode', { ...graph, node_id: node.id, inputs });
}

/**
 * What *node* hands on, run by itself on *inputs*. A failure is thrown, not
 * caught: a node told to catch its failures puts the reason on its error port
 * and hands on nothing, so a folder that does not exist was listed as "0 files".
 */
async function readAlone(node: GraphNode, inputs: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const result = await runAlone(node, inputs);
  if (result.status === 'error') throw new Error(result.error || 'It could not be read.');
  return result.outputs ?? {};
}

/** A copy of *node* with *config* changed, and the ports that follow from it. */
function reading(node: GraphNode, config: Partial<GraphNode['config']>): GraphNode {
  const next = { ...node, config: { ...node.config, ...config, catch_errors: false } };
  return { ...next, ...(derivedNodePorts(next) ?? {}) };
}

/** The files a folder node lists, as a run lists them. */
export async function listAsRun(node: GraphNode): Promise<string[]> {
  const listed = (await readAlone(reading(node, {}))).files;
  return Array.isArray(listed) ? listed.map(String) : [];
}

/**
 * The files a folder picker on a page lists, as a run lists them: by a
 * folder node set as the picker is, since both list through the one function
 * (`folderListing.ts`).
 */
export async function listBlockAsRun(widget: GuiWidget): Promise<string[]> {
  const folder = NODE_KINDS.folder.create('folder');
  return listAsRun({
    ...folder,
    config: { ...folder.config, path: String(widget.value ?? ''), extensions: widget.extensions ?? '', recursive: widget.recursive === true },
  });
}

/**
 * The text of the file at *path*, as a run hands it to an input that reads
 * it -- a Word document as its text, a picture as the file itself -- by a code
 * node with such an input, run on its own: the run's one way of reading a file.
 */
export async function textAsRun(path: string): Promise<string> {
  const code = NODE_KINDS.code.create('reader');
  const reader: GraphNode = {
    ...code,
    inputs: [{ id: 'file', name: 'file', kind: 'input', data_type: 'file_path', multi: false, required: true, description: '' }],
    outputs: [{ id: 'text', name: 'text', kind: 'output', data_type: 'any', multi: false, required: false, description: '' }],
    config: { ...code.config, code: 'function run(inputs) { return { text: inputs.file }; }' },
  };
  const { text } = await readAlone(reader, { file: path });
  return typeof text === 'string' ? text : JSON.stringify(text);
}

/** What a node is handed when the files are read: JSON when it is JSON, the text otherwise. */
export function contentValue(text: string): unknown {
  const trimmed = text.trim();
  if (!/^[[{"]/.test(trimmed)) return text;
  try {
    return JSON.parse(trimmed);
  } catch {
    return text;
  }
}

/**
 * What a file -- picked with 📂 or dropped -- puts into the example on an
 * input: its *path* where the node *reads* the file there, kept as a graph
 * keeps a path (`storedPath`), so the example holds what a run hands the node;
 * and otherwise what it says (*text*), parsed when it is JSON. Only the one
 * that is used is asked for: a dropped file's path is looked for, a picked
 * file's text read.
 */
export async function fileValue(
  reads: boolean,
  path: () => Promise<string>,
  text: () => Promise<string>,
  kept: (path: string) => Promise<string> = storedPath,
): Promise<unknown> {
  return reads ? kept(await path()) : contentValue(await text());
}

/**
 * *path* as a graph keeps it: relative to *home* -- the folder the server
 * runs in, which is what a run resolves a relative path against -- when it is
 * inside it, with forward slashes, so the graph opens the same on another
 * machine and in another checkout. Anywhere else it stays as it is.
 */
function relativeTo(home: string, path: string): string {
  const slashed = (text: string) => text.replace(/\\/g, '/');
  const root = slashed(home).replace(/\/+$/, '');
  const full = slashed(path);
  const windows = /^[A-Za-z]:\//.test(root);
  const same = (a: string, b: string) => (windows ? a.toLowerCase() === b.toLowerCase() : a === b);
  if (root && same(full.slice(0, root.length), root) && full[root.length] === '/') return full.slice(root.length + 1);
  return path;
}

let home: Promise<string> | null = null;

/** A picked path as it is stored: see `relativeTo`. The server's folder is asked once. */
async function storedPath(path: string): Promise<string> {
  // A failed answer is not kept: the next pick asks again.
  home ??= call('browse', { path: '' }).then((page) => page.path).catch(() => { home = null; return ''; });
  return relativeTo(await home, path);
}
