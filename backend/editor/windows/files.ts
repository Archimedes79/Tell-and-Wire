// The windows of a project, as a file of their own.
//
// `graph-windows.json` is what the notebook edits; the graph, the schedule and the gui beside it are
// made from it (`gui/editor/windows`) and are what runs. Only the editor reads and writes this file: a
// package carries what was made, and a project opened in the graph editor still opens, with the file
// beside it left alone.
//
// It holds a `signature` of what was made. Open the project and make the signature again from the graph
// on disk: where they differ, the graph was changed by something else (the graph editor, git), and the
// notebook says so instead of writing over it.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Graph } from '../../../graph/graph.ts';
import { sorted } from '../../../graph/files/nodesFile.ts';
import { parseWindows } from '../../../gui/editor/windows/read.ts';
import type { Windows } from '../../../gui/editor/windows/windows.ts';

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
    metadata: { name: graph.metadata.name, description: graph.metadata.description, gui_scheme: graph.metadata.gui_scheme },
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

/** Keep *windows* in *folder*, with the signature of what they made. */
export async function writeKept(folder: string, kept: Kept): Promise<void> {
  const body = sorted({ signature: kept.signature, windows: JSON.parse(JSON.stringify(kept.windows)) });
  await writeFile(join(folder, WINDOWS_FILE), `${JSON.stringify(body, null, 2)}\n`, 'utf8');
}
