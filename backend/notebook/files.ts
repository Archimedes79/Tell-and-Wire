// What the notebook reads and writes of a project besides the project's own files: nothing, any more.
//
// The windows are read from the graph and the gui (`gui/notebook/fromGraph.ts`), and what they make is written as every graph is
// (`backend/authoring`). Only a project the notebook saved before that has a file of its own, `graph-windows.json`: it is still read,
// as it was, for as long as it is there, and the next save writes the project without it.
//
// Such a file holds a `signature` of what was made. Open the project and make the signature again from the graph on disk: where they
// differ, the graph was changed by something else (the graph editor, git), and the notebook says so instead of writing over it.
//
// What a graph is, as far as the notebook is concerned, is `signatureOf` below: the nodes with their words and ports, the wires, the schedule
// and the gui's blocks -- the same reading tells a graph that is what its windows make from one that is not.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Graph } from '../../graph/graph.ts';
import { scheme } from '../../gui/scheme.ts';
import { parseWindows } from '../../gui/notebook/read.ts';
import type { Windows } from '../../gui/notebook/windows.ts';

export const WINDOWS_FILE = 'graph-windows.json';

/** A value as JSON with every object's keys in one order: two that say the same compare equal. */
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => (
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : item));

/**
 * What the windows made, as a short fingerprint: the nodes with their words and ports, the wires, the
 * schedule, the gui's blocks, the graph's name and scheme -- and not where a card stands, nor what a
 * model wrote for a cell (its prompt, its code), which is the cell's own and changes without the windows.
 */
export function signatureOf(graph: Graph): string {
  const made = {
    metadata: { name: graph.metadata.name, description: graph.metadata.description, gui_scheme: scheme(graph.metadata.gui_scheme).id },
    nodes: graph.nodes.map((node) => ({
      id: node.id, type: node.node_type, label: node.label, description: node.description, inputs: node.inputs, outputs: node.outputs,
      config: { batch_mode: node.config.batch_mode, batch_concurrency: node.config.batch_concurrency },
    })),
    edges: graph.edges.map((edge) => edge.id).sort(),
    schedule: graph.schedule ?? null,
    blocks: graph.gui?.blocks ?? [],
  };
  return createHash('sha256').update(canonical(made)).digest('hex').slice(0, 16);
}

/** The windows a project folder keeps, and the signature of what they made when they were saved. */
export interface Kept {
  windows: Windows;
  signature: string;
}

/** The windows kept in *folder*, or none where it has no such file -- or one that cannot be read. */
export async function readKept(folder: string): Promise<Kept | null> {
  const path = join(folder, WINDOWS_FILE);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(await readFile(path, 'utf8')) as { windows?: unknown; signature?: unknown };
    return { windows: parseWindows(raw.windows), signature: typeof raw.signature === 'string' ? raw.signature : '' };
  } catch {
    return null;
  }
}

/** The file of a project saved before the windows were read from its graph, taken away: what it held is in the graph's own files now. */
export async function forgetKept(folder: string): Promise<void> {
  await rm(join(folder, WINDOWS_FILE), { force: true });
}
