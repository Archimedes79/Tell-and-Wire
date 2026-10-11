// A graph written as a folder: the project, saved.
//
// The other half of `backend/deployment/project/folder.ts`, which reads it. Only the editor writes a
// project -- a package is one, written by the editor's Deploy -- so this half is not carried.
// What is written, and where, is described there.

import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';

import type { Graph } from '../../../graph/graph.ts';
import { NESTED_GRAPH_FIELD, type TextChange } from '../../../graph/files/changes.ts';
import { registry } from '../../../graph/nodes/registry.ts';
import { designs } from '../../../graph/editor/nodes/registry.ts';
import { describeNodes, NODES_FILE, sorted } from '../../../graph/files/nodesFile.ts';
import { FLOW_FILE, flowOf } from '../../../graph/files/flow.ts';
import { NotAGraph, NotFound } from '../../../graph/errors.ts';
import {
  ABSENT, FileChanged, LAYOUT_FILE, NODES_DIR, derivePorts, fileFor, heldIn, isProjectFolder, looksLikeGraph, nestedGraphs, nodeFolder, projectFolderOf,
  projectTexts, readProject, readStructure, remember, seen, signature, textFields, toFile, withoutEmptyGui, type Guard,
} from '../../deployment/project/folder.ts';

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * Write *graph* as the project folder *folder*.
 *
 * Every text goes to its file and out of its node's settings in `graph-nodes.json`; a text that is empty
 * has no file, and one that was emptied loses it. Files a node no longer has
 * -- it was deleted, or became another kind -- are removed, but only files with the
 * names elements write: whatever else a person put in the folder stays.
 *
 * Refuses, before writing anything, when a file it would change was changed
 * by someone else since it was last read.
 */
export async function writeProject(folder: string, graph: Graph, guard?: Guard): Promise<void> {
  // Every level is worked out before any of it is written, because a project
  // is now a tree: a child written while its parent is still being checked is
  // exactly the half-save this promises not to do.
  const plans = planProject(folder, structuredClone(graph));
  await refuseIfChangedOutside(plans);
  for (const plan of plans) await commit(plan, guard);
}

/** One folder's worth of writing, worked out and not yet done. */
interface Plan {
  folder: string;
  /** Path to content, or null for a file that must go. */
  files: Map<string, string | null>;
  /**
   * The folders under `nodes/` that `tidy` leaves alone: those holding a
   * project of their own, whose own save tidies them, and those of a node of a
   * type this version does not know, which claims no files it can name.
   */
  untouched: Set<string>;
}

/** What writing *graph* into *folder* comes to, this level and every level below it. */
function planProject(folder: string, copy: Graph, root = folder): Plan[] {
  // A node whose ports follow from its settings -- a start point's, a
  // subgraph's from its graph -- has them as they follow, and graph-nodes.json keeps
  // only what a person chose of them. Before the graphs a node holds are
  // taken out below: its ports are read from them.
  const derived = derivePorts(copy);
  const deeper: Plan[] = [];
  const untouched = new Set<string>();
  for (const held of nestedGraphs(copy)) {
    const inside = join(folder, held.folder);
    untouched.add(inside);
    deeper.push(...planProject(inside, held.graph, root));
    // Written down there, so it comes out of this node's settings up here --
    // the same rule that keeps a code node's body out of them.
    registry.node(held.node.node_type)?.setNestedGraph(held.node, null);
  }

  const files = new Map<string, string | null>();
  const flow = flowOf(copy);
  for (const node of copy.nodes) {
    const element = registry.node(node.node_type);
    // A typo in a kind in graph-nodes.json must not cost the node its code on the next save.
    if (!element) untouched.add(join(folder, nodeFolder(node.id)));
    else {
      // A node that became another kind -- by ✨ Describe a graph, the bar, a model
      // over MCP -- keeps none of the old kind's writing: in graph-nodes.json it
      // would be a setting nothing reads. Its file goes as one no node keeps.
      const own = new Set(element.texts(node).map((text) => text.field));
      for (const field of textFields(node)) if (!own.has(field)) delete node.config[field];
    }
  }
  // Each block's keys in one order, so an unchanged gui saves unchanged; and
  // a gui of no blocks is no gui, with no file.
  const blocks = (copy.gui?.blocks ?? []).map((block) => sorted(block));
  for (const text of projectTexts(copy)) {
    const value = text.node_id === null ? (blocks.length ? blocks : undefined) : text.holder[text.field];
    delete text.holder[text.field];
    files.set(join(folder, text.path), fileFor(value, text));
  }

  const layout: Record<string, Record<string, number>> = {};
  for (const node of copy.nodes) {
    layout[node.id] = {
      x: Math.round(node.position?.x ?? 0),
      y: Math.round(node.position?.y ?? 0),
      ...(node.width ? { width: Math.round(node.width) } : {}),
      ...(node.height ? { height: Math.round(node.height) } : {}),
    };
  }
  // Files like the rest, so one changed outside -- another writer added a node
  // and its folder -- refuses the save instead of being written over, and the
  // new node's files tidied away. The list last: the writing is out of the settings by now.
  files.set(join(folder, FLOW_FILE), toFile(flow, true));
  files.set(join(folder, NODES_FILE), toFile(describeNodes(copy.nodes, derived), true));
  files.set(join(folder, LAYOUT_FILE), toFile(layout, true));

  // Deepest first, so a level is only written once everything it holds is.
  return [...deeper, { folder, files, untouched }];
}

/**
 * Look first, write after: half a save is worse than none.
 *
 * Over the whole tree before anything is written. Only what exists can be
 * lost -- a file deleted outside since is simply written again.
 */
async function refuseIfChangedOutside(plans: Plan[]): Promise<void> {
  const root = plans[plans.length - 1].folder;
  for (const plan of plans) {
    for (const [path, content] of plan.files) {
      const known = seen.get(path);
      const now = await signature(path);
      if (known === undefined || known === now || now === ABSENT) continue;
      if (await readFile(path, 'utf8') !== content) {
        // Named from the project a person opened, not from the folder this
        // level happens to be: `nodes/part/nodes/shorten/code.js` is a path
        // they can find, `nodes/shorten/code.js` is not.
        throw new FileChanged(path.slice(root.length + 1).replace(/\\/g, '/'));
      }
    }
  }
}

/** One level, written: its files, what is left over, and the two documents. */
async function commit(plan: Plan, guard?: Guard): Promise<void> {
  for (const [path, content] of plan.files) {
    await guard?.(path);
    if (content === null) {
      if (existsSync(path)) await rm(path);
    } else {
      await mkdir(dirname(path), { recursive: true });
      // Beside, then over: a crash mid-write leaves the old file whole.
      await writeFile(`${path}.tmp`, content, 'utf8');
      await rename(`${path}.tmp`, path);
    }
    await remember(path);
  }
  const claimed = new Set(plan.files.keys());
  await tidy(join(plan.folder, NODES_DIR), claimed, plan.untouched);
}

/**
 * Remove the files nothing claims any more, and the folders that leaves empty.
 *
 * Only files this process read or wrote as a node's -- a deleted node's, a
 * file a node of another kind no longer keeps. A file
 * it never saw is a person's, whatever it is called and however deep it sits:
 * `nodes/count/fixtures/code.js` stays.
 *
 * *untouched* is the folders of the nodes that hold a graph **now**, whose
 * files that project's own save claims, and of nodes of an unknown type.
 * Anything else is this project's to clean, a folder left behind by a subgraph
 * node that was deleted included.
 */
async function tidy(directory: string, claimed: Set<string>, untouched: Set<string>): Promise<boolean> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return false;
  }
  let empty = true;
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (untouched.has(path)) empty = false;
      else if (await tidy(path, claimed, untouched)) await rmdir(path);
      else empty = false;
    } else if (!claimed.has(path) && seen.has(path)) {
      await rm(path);
      seen.delete(path);
    } else {
      empty = false;
    }
  }
  return empty;
}

/** A single graph file, everything inline: what a download, a bundle and an import carry. */
async function writeGraphFile(path: string, graph: Graph, guard?: Guard): Promise<void> {
  await guard?.(path);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(graph, null, 2)}\n`, 'utf8');
}

/** Whether the file at *path* is a graph (`looksLikeGraph`). */
function isGraphFile(path: string): boolean {
  try {
    return looksLikeGraph(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return false;
  }
}

/**
 * The graph a save to *path* would write over -- the project folder there, or
 * the graph file -- or null where there is none and the save makes one.
 */
export function graphAt(path: string): string | null {
  const full = resolve(path);
  return projectFolderOf(full) ?? (extname(full).toLowerCase() === '.json' && isGraphFile(full) ? full : null);
}

/**
 * Save to *path* as what it names: a `.json` path outside a project is one
 * file, anything else a folder. A `.json` file that is no graph -- a
 * `package.json` -- is nobody's to replace.
 */
export async function saveGraph(path: string, graph: Graph, guard?: Guard): Promise<void> {
  const full = resolve(path);
  const folder = projectFolderOf(full);
  if (folder) return writeProject(folder, graph, guard);
  if (basename(full) === FLOW_FILE) return writeProject(dirname(full), graph, guard);
  if (extname(full).toLowerCase() === '.json') {
    await guard?.(full);
    if (existsSync(full) && !isGraphFile(full)) throw new NotAGraph(`${full} is a file that holds no graph, and saving would replace it. Save under another name.`);
    return writeGraphFile(full, graph, guard);
  }
  return writeProject(full, graph, guard);
}

/**
 * One of a node's files, relative to the project folder --
 * `nodes/count/code.js`, `nodes/say/history.md`,
 * `nodes/part/nodes/count/code.js` -- for opening it in the person's own
 * editor. The node is one of the graph *inside* leads down to: the ids of the
 * nodes whose graphs hold it, outermost first, and none for the graph at the
 * top. Ids are each graph's own, so an inner `count` is not the outer one:
 * the inner node's chip opened the outer node's file. *file* is named from the
 * node's folder, and must be one of the texts the node keeps; without it, the
 * body. A text nothing has been written into yet is created -- its stub, or
 * empty -- so there is something to open.
 */
export async function nodeFileOf(folder: string, nodeId: string, file?: string, inside: readonly string[] = []): Promise<string> {
  // Down through the folders the graphs are kept in, as `nestedGraphs` names them.
  let level = '';
  for (const holder of inside) {
    const { graph: above } = await readStructure(join(folder, level));
    const held = nestedGraphs(above).find((nested) => nested.node.id === holder);
    const down = held && (level ? `${level}/${held.folder}` : held.folder);
    if (!down || !isProjectFolder(join(folder, down))) throw new NotFound(`No graph inside "${holder}" in ${join(folder, level)}. Save the graph first.`);
    level = down;
  }
  const here = join(folder, level);
  const { graph } = await readStructure(here);
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new NotFound(`No node "${nodeId}" in ${here}. Save the graph first.`);
  const texts = projectTexts(graph).filter((text) => text.node_id === nodeId);
  withoutEmptyGui(graph);
  const generation = designs.node(node.node_type)?.generation();
  const body = file === undefined
    ? texts.find((text) => text.field === generation?.fields.body) ?? texts[0]
    : texts.find((text) => text.path === `${nodeFolder(nodeId)}/${file}`);
  if (!body) {
    const kept = texts.map((text) => text.path.slice(text.path.lastIndexOf('/') + 1));
    throw file === undefined
      ? new NotFound(`"${nodeId}" keeps nothing in files.`)
      : new Error(`"${file}" is not one of the files of "${nodeId}": it keeps ${kept.length ? kept.join(', ') : 'none'}.`);
  }
  const path = join(here, body.path);
  if (!existsSync(path)) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, fileFor(undefined, body) ?? '', 'utf8');
    await remember(path);
  }
  return level ? `${level}/${body.path}` : body.path;
}

// ---------------------------------------------------------------------------
// What changed on disk
// ---------------------------------------------------------------------------

/**
 * The texts of the project in *folder* whose files changed since this process
 * last read or wrote them -- edited in another editor, restored by git,
 * deleted -- with what they say now. Each is then taken as seen: asking twice
 * reports it once. Only texts are watched; the flow, or a node's settings or
 * ports, changing under an open editor is a reload, not a patch.
 *
 * Taken as seen only once every one has been read, as `changedUnder` does: a
 * JSON text caught half-written throws, and a change marked seen on the way to
 * that was never handed over -- nor refused by the next save, which wrote over it.
 */
export async function changesOnDisk(folder: string): Promise<TextChange[]> {
  const { graph } = await readStructure(folder);
  const changes: TextChange[] = [];
  const looked = new Map<string, string>();
  for (const text of projectTexts(graph)) {
    const path = join(folder, text.path);
    const known = seen.get(path);
    const now = await signature(path);
    if (known === undefined || known === now) continue;
    const held = now === ABSENT ? undefined : heldIn(await readFile(path, 'utf8'), text, text.path);
    const value = held ? held.value : text.json ? null : '';
    looked.set(path, now);
    changes.push({ node_id: text.node_id, field: text.field, value });
  }
  // A node that holds a graph: anything changed in its folder is that graph
  // changed, and it comes back whole. Which file it was is a distinction
  // nobody taking the change can do anything with.
  for (const nested of nestedGraphs(graph)) {
    const inside = join(folder, nested.folder);
    if (!isProjectFolder(inside)) continue;
    try {
      if (!await changedUnder(inside)) continue;
      changes.push({
        node_id: nested.node.id, field: NESTED_GRAPH_FIELD, value: await readProject(inside),
      });
    } catch (error) {
      // Half-written by whoever is editing it: JSON cut off, a file between
      // being deleted and written again. What was collected above is still
      // good and is handed over; this folder is not marked as seen, so the
      // next look asks again. Anything else is a real failure, and is said.
      if (!(error instanceof NotAGraph || error instanceof NotFound)) throw error;
    }
  }
  for (const [path, signed] of looked) seen.set(path, signed);
  return changes;
}

/**
 * Whether anything in the project at *folder* changed since it was last read
 * or written.
 *
 * Nothing is marked as seen until the whole folder has been looked at without
 * trouble: a `graph-flow.json` caught half-written throws, and a file marked seen
 * on the way to that would never be reported again.
 */
async function changedUnder(folder: string): Promise<boolean> {
  let changed = false;
  const looked = new Map<string, string>();
  const look = async (path: string): Promise<void> => {
    const now = await signature(path);
    const known = seen.get(path);
    if (known !== undefined && known !== now) changed = true;
    looked.set(path, now);
  };

  const { graph, files } = await readStructure(folder);
  for (const path of files.keys()) await look(path);
  await look(join(folder, LAYOUT_FILE));
  for (const text of projectTexts(graph)) await look(join(folder, text.path));
  for (const nested of nestedGraphs(graph)) {
    const inside = join(folder, nested.folder);
    if (isProjectFolder(inside) && await changedUnder(inside)) changed = true;
  }

  for (const [path, signed] of looked) seen.set(path, signed);
  return changed;
}
