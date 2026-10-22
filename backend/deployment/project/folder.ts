// A graph as a folder: the project.
//
//     my_tool/
//       graph-flow.json           the flow: the graph's name, and every wire
//       graph-nodes.json          the nodes: each one's kind, heading, text, settings and ports
//       graph-schedule.json       the order the nodes run in and where they stand: a table
//                                 of cells, and the size of the cards a person resized
//       gui.json                  the GUI: what whoever uses the tool sees -- its blocks,
//                                 in order, each with what it connects to
//       nodes/
//         count/            one folder per node that keeps writing, by id
//           input_example.js …      what the node keeps in files: `NodeDefinition.texts`
//
// **Each fact in one place.** The flow says which node feeds which, and nothing
// about any node. The list says what each node is, and nothing about its
// neighbours: a node that needs to know what arrives follows the wire and reads
// the other node's ports there. Together they are the graph; the engine needs
// no more, but for the writing. The schedule is split off so that the order of
// running, which is a person's to choose, is not mixed with what the nodes are
// (`graph/schedule.ts`); writing -- code, prompts -- is a file of its own so it
// is edited, reviewed and grepped as what it is.
//
// **The GUI sits beside the graph, not in it.** It is no node: a graph has one
// gui, what a person using the tool sees, and its blocks connect themselves to
// the graph's start and end points by name -- so it is a file of its own, and
// the flow does not name it.
//
// **One other shape opens.** A single `.json` graph with everything inline --
// what a download and an import carry -- opens as it is. A deploy bundle is a
// project folder like this one.
// Wherever a text has a file, the file wins over the inline value.
//
// **Everything reads through here.** The editor, a command line run, a served
// tool and the MCP server open a project the same way, which is the point: a
// node's code in `code.js` is the node's code wherever the graph is run from.

import { existsSync, realpathSync, statSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { platform } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

import { parseGraph, type Graph, type GraphNode } from '../../../graph/graph.ts';
import { registry } from '../../../graph/nodes/registry.ts';
import { keepingFields } from '../../../graph/nodes/port.ts';
import { NODES_FILE } from '../../../graph/files/nodesFile.ts';
import { FLOW_FILE, graphFrom } from '../../../graph/files/flow.ts';
import { folderName } from '../../../graph/files/names.ts';
import { NotAGraph, NotFound } from '../../../graph/errors.ts';

export const SCHEDULE_FILE = 'graph-schedule.json';
export const GUI_FILE = 'gui.json';
export const NODES_DIR = 'nodes';

export class FileChanged extends Error {
  readonly fileName: string;
  constructor(fileName: string) {
    super(`${fileName} was changed outside the editor since it was last read. `
      + 'Reload the project to take that change, or save it somewhere else.');
    this.fileName = fileName;
  }
}

/**
 * A hook every file read and written goes through, for a caller that must
 * confine what may be touched (the MCP server). It throws to refuse.
 */
export type Guard = (path: string) => Promise<void>;

// ---------------------------------------------------------------------------
// Where things are
// ---------------------------------------------------------------------------

/** A folder with a `graph-flow.json` in it. */
export function isProjectFolder(path: string): boolean {
  try {
    return statSync(path).isDirectory() && existsSync(join(path, FLOW_FILE));
  } catch {
    return false;
  }
}

/**
 * The project folder *path* means, or null for a plain graph file.
 *
 * A folder is one; so is its `graph-flow.json`, named directly -- which is how a tool
 * that only deals in `.json` paths (the MCP server, a shell's tab completion)
 * reaches one.
 */
export function projectFolderOf(path: string): string | null {
  const full = resolve(path);
  if (isProjectFolder(full)) return full;
  if (basename(full) === FLOW_FILE && existsSync(full)) return dirname(full);
  return null;
}

/**
 * A GUI of a project's own, written by hand: served at `/` in place of the
 * built gui when it holds an `index.html`, and carried by a bundle. It uses
 * the graph only through the runtime API, by name (`backend/deployment/host/api.ts`). Not
 * `gui.json`: that is the built-in GUI's, its blocks.
 */
export const FRONTEND_DIR = 'frontend';

/** The project's own frontend (`FRONTEND_DIR`), when the graph at *path* is a project that has one. */
export function frontendOf(path: string): string | null {
  const folder = projectFolderOf(path);
  const frontend = folder ? join(folder, FRONTEND_DIR) : null;
  return frontend && existsSync(join(frontend, 'index.html')) ? frontend : null;
}

/** What a session of a project keeps beside its `graph-flow.json`: never read or written as part of the project. */
export const STATE_FILE = 'state.json';

/**
 * Where a session of the graph at *path* keeps what using it leaves behind
 * (`backend/deployment/host/session.ts`): `state.json` in a project folder, `<file>.state.json`
 * beside a single graph file.
 */
export function stateFileOf(path: string): string {
  const folder = projectFolderOf(path);
  return folder ? join(folder, STATE_FILE) : `${resolve(path)}.state.json`;
}

/** Where the node *nodeId* keeps its files, relative to the project folder: `nodes/<id>/`. */
export function nodeFolder(nodeId: string): string {
  return `${NODES_DIR}/${folderName(nodeId)}`;
}

/** The field the GUI's text is reported under (`TextChange`): its blocks. */
const GUI_FIELD = 'blocks';

/** One piece of writing in a graph: whose it is, which field holds it, and where its file goes. */
interface ProjectText {
  /** The node it is a node's; null for the graph's own -- its GUI. */
  node_id: string | null;
  field: string;
  /** Relative to the project folder, with `/`. */
  path: string;
  /** Where the field lives: the node's config, or the GUI. */
  holder: Record<string, unknown>;
  /** See `TextFile`: a value kept as JSON, the file's stub, and what follows what the node holds. */
  json: boolean;
  standard?: string;
  footer?: string;
}

/**
 * Every piece of writing *graph* can keep in files, whether or not it holds
 * any: each node's, and the GUI's -- which, to be read into, is given a
 * place in *graph* while it has none (`withoutEmptyGui` takes it out again).
 */
export function projectTexts(graph: Graph): ProjectText[] {
  graph.gui ??= { blocks: [] };
  const found: ProjectText[] = [{ node_id: null, field: GUI_FIELD, path: GUI_FILE, holder: graph.gui as unknown as Record<string, unknown>, json: true }];
  // Each node claims its folder once. Compared without case: on the disk most
  // people use, "Count" and "count" are one folder, and whichever was written
  // last would be the only one there.
  const folders = new Map<string, string>();
  const claim = (folder: string, owner: string): string => {
    const other = folders.get(folder.toLowerCase());
    if (other !== undefined) {
      throw new NotAGraph(other === owner
        ? `Two of them are called "${owner}", and would share the folder ${folder}. Give one of them another id.`
        : `"${other}" and "${owner}" would share the folder ${folder}. Give one of them another id.`);
    }
    folders.set(folder.toLowerCase(), owner);
    return folder;
  };

  for (const node of graph.nodes) {
    const folder = claim(nodeFolder(node.id), node.id);
    for (const text of registry.node(node.node_type)?.texts(node) ?? []) {
      found.push({
        node_id: node.id, field: text.field, path: `${folder}/${text.file}`,
        holder: node.config, json: text.json === true,
        ...(text.standard !== undefined ? { standard: text.standard } : {}),
        ...(text.footer !== undefined ? { footer: text.footer } : {}),
      });
    }
  }
  return found;
}

/**
 * Give every node the files its folder holds beside the ones it names (`NodeDefinition.fieldOfFile`: the files beside a code
 * node's code.js), as settings with nothing in them yet, so that `projectTexts` knows them and the reading fills them.
 * A file a person put there is part of the node from then on -- and goes when the node does not hold it any more.
 */
export async function addFilesBeside(folder: string, graph: Graph): Promise<void> {
  for (const node of graph.nodes) {
    const element = registry.node(node.node_type);
    if (!element) continue;
    let entries;
    try {
      entries = await readdir(join(folder, nodeFolder(node.id)), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const field = entry.isFile() ? element.fieldOfFile(entry.name) : undefined;
      if (field !== undefined && !(field in node.config)) node.config[field] = '';
    }
  }
}

/** *graph* without the GUI `projectTexts` gave it a place for, when nothing was put there: a GUI is its blocks. */
export function withoutEmptyGui(graph: Graph): Graph {
  if (!graph.gui?.blocks?.length) delete graph.gui;
  return graph;
}

/** The settings any kind of node keeps in a file of its own (`NodeDefinition.texts`), asked of every kind for *node*. */
export function textFields(node: GraphNode): Set<string> {
  return new Set(registry.nodeTypes().flatMap((type) => registry.node(type)?.texts(node).map((text) => text.field) ?? []));
}

/** One node that holds a graph, and the folder that graph is kept in. */
interface NestedGraph {
  node: GraphNode;
  /** Relative to the project folder, with `/`. */
  folder: string;
  graph: Graph;
}

/**
 * The nodes of *graph* that hold a graph of their own.
 *
 * A node's graph is a project folder like any other, one level down, so
 * reading, writing, tidying and checking all recurse here rather than growing
 * a second way of storing a graph.
 */
export function nestedGraphs(graph: Graph): NestedGraph[] {
  const found: NestedGraph[] = [];
  for (const node of graph.nodes) {
    const held = registry.node(node.node_type)?.nestedGraph(node);
    if (held) found.push({ node, folder: nodeFolder(node.id), graph: held });
  }
  return found;
}

// ---------------------------------------------------------------------------
// Text in files
// ---------------------------------------------------------------------------

/**
 * Exactly one newline is added on the way out and taken off on the way in, so
 * what was in the field is what comes back -- and a file saved by an editor
 * that ends every file with a newline reads as the text without it.
 */
export function toFile(value: unknown, json: boolean): string {
  return `${json ? JSON.stringify(value, null, 2) : String(value)}\n`;
}

/**
 * What the file of *text* says for *value*: the text -- or the JSON, of a
 * value kept as JSON -- with the footer after it; the stub while the node
 * holds nothing there; or null, for no file at all.
 */
export function fileFor(value: unknown, text: ProjectText): string | null {
  if (isBlank(value)) return text.standard === undefined ? null : toFile(text.standard, false);
  const said = text.json || typeof value !== 'string' ? JSON.stringify(value, null, 2) : value;
  return toFile(text.footer ? `${said.replace(/\n+$/, '')}\n\n${text.footer}` : said, false);
}

/**
 * Where a footer stands in *said*: as it is written now or, in a file a version of Tell & Wire that worded it otherwise wrote, from the line
 * that starts it to the first line after that which is its last -- the footers are a few lines that begin and end alike. Without that, an
 * old footer would stay in the node's code and the next save would write the new one beneath it.
 */
function footerAt(said: string, footer: string): { at: number; end: number } | undefined {
  const exact = said.indexOf(footer);
  if (exact >= 0) return { at: exact, end: exact + footer.length };
  const lines = footer.split('\n');
  if (lines.length < 3) return undefined;
  // the first line by its words, not its rule: `// ── Run on its own ────` is found under any count of dashes
  const title = /\p{L}[\p{L} ]*\p{L}/u.exec(lines[0])?.[0];
  if (!title) return undefined;
  const closing = lines[lines.length - 1].trimEnd();
  const rows = said.split('\n');
  const first = rows.findIndex((row) => row.startsWith(lines[0].slice(0, 2)) && row.includes(title));
  const last = first < 0 ? -1 : rows.findIndex((row, index) => index > first && row.trimEnd() === closing);
  if (last < 0) return undefined;
  const at = rows.slice(0, first).reduce((sum, row) => sum + row.length + 1, 0);
  return { at, end: at + rows.slice(first, last + 1).join('\n').length };
}

/**
 * What the node holds, for a file of *text* that says *content*: the file
 * without its footer -- wherever it stands, and however an older version
 * worded it: code added after it is the node's, and a footer kept in the body
 * was written twice by the next save -- parsed where it is JSON, or nothing,
 * for the stub.
 */
export function heldIn(content: string, text: ProjectText, path: string): { value: unknown } | undefined {
  let said = content.replace(/\r\n/g, '\n').replace(/\n$/, '');
  for (let found = text.footer ? footerAt(said, text.footer) : undefined; found; found = footerAt(said, text.footer!)) {
    const before = said.slice(0, found.at).replace(/\s+$/, '');
    const after = said.slice(found.end).trim();
    said = after ? `${before}\n\n${after}` : before;
  }
  if (text.standard !== undefined && said.trim() === text.standard.trim()) return undefined;
  if (!text.json) return { value: said };
  let value: unknown;
  try {
    value = JSON.parse(said);
  } catch (error) {
    throw new NotAGraph(`${path} is not valid JSON: ${(error as Error).message}`);
  }
  // The GUI's file is its list of blocks and nothing else: `{"blocks": […]}` or `null` would read as
  // no GUI at all, and the next save would delete the file.
  if (text.node_id === null && !(Array.isArray(value) && value.every((block) => !!block && typeof block === 'object' && !Array.isArray(block)))) {
    throw new NotAGraph(`${path} must be a list of blocks: [ { "id": …, "kind": … }, … ].`);
  }
  return { value };
}

/**
 * Nothing written: no file for it, or its stub. An empty object is not
 * nothing -- a data node nobody has given a field yet -- and taken for it, it
 * came back null.
 */
function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && !value.trim());
}

// ---------------------------------------------------------------------------
// "Changed on disk since we last looked"
// ---------------------------------------------------------------------------
//
// Two editors write the same files: this one on save, and whatever the folder
// is open in. Every read and write records what a file looked like; a save
// that would overwrite a file changed since then refuses, and the editor asks
// what changed (`changesOnDisk`) to take it in. Per process, deliberately: a
// local tool, and a guard that forgets on restart is honest about what it can
// promise.

export const ABSENT = 'absent';

/** The real path of each folder asked about, so the many files in it cost one look. */
const folderKeys = new Map<string, string>();

/**
 * *path* as one key however it was spelled: through its folder's real path (a
 * link, a short name), and without case where the disk has none (Windows) --
 * `C:\x` and `c:\x` are one project.
 */
export function keyOf(path: string): string {
  const folder = dirname(path);
  let real = folderKeys.get(folder);
  if (real === undefined) {
    try {
      real = realpathSync.native(folder);
      folderKeys.set(folder, real);
    } catch {
      real = folder; // not made yet: as spelled
    }
  }
  const key = join(real, basename(path));
  return platform() === 'win32' ? key.toLowerCase() : key;
}

class Seen extends Map<string, string> {
  override get(path: string) { return super.get(keyOf(path)); }
  override set(path: string, signed: string) { return super.set(keyOf(path), signed); }
  override has(path: string) { return super.has(keyOf(path)); }
  override delete(path: string) { return super.delete(keyOf(path)); }
}

export const seen = new Seen();

export async function signature(path: string): Promise<string> {
  try {
    const info = await stat(path);
    return `${info.mtimeMs}:${info.size}`;
  } catch {
    return ABSENT;
  }
}

export async function remember(path: string): Promise<void> {
  seen.set(path, await signature(path));
}

/** Forget every file: for tests, which reuse paths a real session would not. */
export function forgetSeen(): void {
  seen.clear();
  folderKeys.clear();
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

async function readJson(path: string, what: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    // Only a file that is not there is "no flow": one that is locked or not allowed is said as it is.
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') throw new NotFound(`No ${what} at ${path}`);
    throw new Error(`The ${what} at ${path} cannot be read (${code ?? (error as Error).message}).`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new NotAGraph(`${path} is not valid JSON: ${(error as Error).message}`);
  }
}

/** Whether *raw* is shaped like a graph: an object with a "nodes" list. `parseGraph` forgives a missing one, and a `package.json` has none. */
export function looksLikeGraph(raw: unknown): boolean {
  return !!raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray((raw as { nodes?: unknown }).nodes);
}

function asGraph(raw: unknown, path: string): Graph {
  if (!looksLikeGraph(raw)) {
    throw new NotAGraph(`${path} is not a graph: it has no "nodes" list.`);
  }
  try {
    return parseGraph(raw);
  } catch (error) {
    throw new NotAGraph(`${path} is not a graph: ${(error as Error).message}`);
  }
}

/**
 * The schedule `graph-schedule.json` says, and the size it gave to cards. With
 * no file the graph has no schedule, and runs in the order of its wires.
 */
function applySchedule(graph: Graph, file: unknown, path: string): void {
  if (!file || typeof file !== 'object') return;
  const { table, size } = file as { table?: unknown; size?: Record<string, { width?: number; height?: number }> };
  if (table !== undefined && (!Array.isArray(table) || table.some((line) => typeof line !== 'string'))) {
    throw new NotAGraph(`${path} is not a schedule: "table" is a list of lines, one per row.`);
  }
  if (Array.isArray(table) && table.length) graph.schedule = table as string[];
  for (const node of graph.nodes) {
    const given = size?.[node.id];
    if (given?.width != null) node.width = Number(given.width);
    if (given?.height != null) node.height = Number(given.height);
  }
}

/** A JSON file that may be missing: `undefined` then. */
async function readIfThere(path: string, what: string, guard?: Guard): Promise<unknown> {
  if (!existsSync(path)) return undefined;
  await guard?.(path);
  return readJson(path, what);
}

/**
 * The structure of the project in *folder*: every node with its settings and
 * ports, and the wires -- without the writing, which `readProject` adds.
 * Returns the files it read, each with its signature from *before* it was
 * read: a file changed while it was being read then still counts as changed.
 */
export async function readStructure(folder: string, guard?: Guard): Promise<{ graph: Graph; files: Map<string, string> }> {
  const files = new Map<string, string>();
  const read = async (name: string, what: string): Promise<{ path: string; json: unknown }> => {
    const path = join(folder, name);
    files.set(path, await signature(path));
    await guard?.(path);
    return { path, json: await readJson(path, what) };
  };
  const flow = await read(FLOW_FILE, 'flow');
  const list = await read(NODES_FILE, 'list of nodes');
  return { graph: graphFrom(flow.json, list.json, flow.path, list.path), files };
}

/**
 * Give every node whose ports follow from its settings -- a start point, a
 * data node from its fields, a subgraph from the graph it holds -- the ports
 * that follow, keeping what a person chose for its inputs (`keepingFields`).
 * The ids of those nodes.
 */
export function derivePorts(graph: Graph): Set<string> {
  const derived = new Set<string>();
  for (const node of graph.nodes) {
    const ports = registry.node(node.node_type)?.derivedPorts(node, registry);
    if (!ports) continue;
    Object.assign(node, keepingFields(ports, node.inputs));
    derived.add(node.id);
  }
  return derived;
}

/** A project folder, with every piece of writing read in from its file. */
export async function readProject(folder: string, guard?: Guard): Promise<Graph> {
  const { graph, files } = await readStructure(folder, guard);
  const schedulePath = join(folder, SCHEDULE_FILE);
  files.set(schedulePath, await signature(schedulePath));
  applySchedule(graph, await readIfThere(schedulePath, 'schedule', guard), schedulePath);
  // Remembered like any other file: a save must not overwrite a node's
  // settings or ports that someone changed since.
  for (const [path, signed] of files) seen.set(path, signed);
  await addFilesBeside(folder, graph);
  for (const text of projectTexts(graph)) {
    const path = join(folder, text.path);
    const signed = await signature(path);
    if (signed !== ABSENT) {
      await guard?.(path);
      const held = heldIn(await readFile(path, 'utf8'), text, path);
      // The stub is nobody's writing: the node holds nothing there.
      if (held) text.holder[text.field] = held.value;
    }
    seen.set(path, signed);
  }
  // A node that holds a graph holds a project folder: the same rule one level
  // down, so the file wins there too.
  for (const nested of nestedGraphs(graph)) {
    const inside = join(folder, nested.folder);
    if (!isProjectFolder(inside)) continue;
    registry.node(nested.node.node_type)?.setNestedGraph(nested.node, await readProject(inside, guard));
  }
  // Last: a data node's ports follow from the fields read above, a subgraph's from the graph just put into it.
  derivePorts(graph);
  return withoutEmptyGui(graph);
}

/**
 * Whatever *path* is: a project folder (or its `graph-flow.json`), or a single
 * graph file. The one way anything in the backend opens a graph.
 */
export async function loadGraph(path: string, guard?: Guard): Promise<Graph> {
  const full = resolve(path);
  const folder = projectFolderOf(full);
  if (folder) return readProject(folder, guard);
  if (!existsSync(full)) throw new NotFound(`Nothing at ${full}`);
  if (statSync(full).isDirectory()) {
    throw new NotAGraph(`${full} is a folder without a ${FLOW_FILE}: not a project.`);
  }
  await guard?.(full);
  return asGraph(await readJson(full, 'graph'), full);
}
