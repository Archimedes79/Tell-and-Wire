// States saved under a name: what a person or a memory node keeps, written out on request and read back on request.
//
// Not `state.json` (`session.ts`), which a session writes by itself after every round. This is the explicit one: a GUI asks to save the state
// now, under a name, or to load one, and the file is plain JSON a person can read and copy (`StateDocument`). It sits in a `states/` folder
// beside the session's own file, so it travels with the tool's folder and is not part of the project (a save and a package leave it out).

import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { STATE_FILE } from '../project/folder.ts';
import type { StateDocument } from './session.ts';

/** What a name may be: letters, digits, spaces, `_`, `.` and `-`, as long as a file name can take, and not hidden or ending in a dot or space. */
const NAME = /^[\p{L}\p{N}_-](?:[\p{L}\p{N} _.-]{0,62}[\p{L}\p{N}_-])?$/u;

/** A name that cannot be one is refused in words, here and nowhere else. */
export class BadStateName extends Error {}

/** The name as a file keeps it, or `BadStateName`: nothing a path could be made of (no folder, no `..`, no drive). */
export function checkedName(name: unknown): string {
  const text = typeof name === 'string' ? name.trim() : '';
  if (!NAME.test(text)) throw new BadStateName('A state is named with letters, digits, spaces, _ . and -, up to 64 of them.');
  return text;
}

/** Where the states of the session that keeps its file at *stateFile* are: beside it. */
export function statesFolderOf(stateFile: string): string {
  if (basename(stateFile) === STATE_FILE) return join(dirname(stateFile), 'states');
  return `${stateFile.replace(/\.state\.json$/, '')}.states`;
}

const fileOf = (folder: string, name: string): string => join(folder, `${checkedName(name)}.json`);

/** One saved state, as it is listed. */
export interface SavedState {
  name: string;
  saved_at: string;
}

/** The states saved in *folder*, the newest first. A file that is not a state is left out. */
export async function listStates(folder: string): Promise<SavedState[]> {
  let names: string[];
  try {
    names = await readdir(folder);
  } catch {
    return [];
  }
  const found: SavedState[] = [];
  for (const file of names) {
    if (!file.endsWith('.json')) continue;
    const name = file.slice(0, -'.json'.length);
    try {
      checkedName(name);
      const saved = (JSON.parse(await readFile(join(folder, file), 'utf8')) as Partial<StateDocument>).saved_at;
      if (typeof saved === 'string') found.push({ name, saved_at: saved });
    } catch {
      // Not ours: left alone, and not listed.
    }
  }
  return found.sort((a, b) => b.saved_at.localeCompare(a.saved_at));
}

/** Write *state* as *name* in *folder*, beside first so that a crash leaves the one before whole. */
export async function saveState(folder: string, name: string, state: StateDocument): Promise<SavedState> {
  const file = fileOf(folder, name);
  await mkdir(folder, { recursive: true });
  await writeFile(`${file}.tmp`, `${JSON.stringify(state, null, 2)}\n`);
  await rename(`${file}.tmp`, file);
  return { name: checkedName(name), saved_at: state.saved_at };
}

/** The state saved as *name*, or an error that says there is none. Its shape is checked: a file somebody edited is no reason to fail late. */
export async function loadState(folder: string, name: string): Promise<StateDocument> {
  const file = fileOf(folder, name);
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    throw new BadStateName(`No state called "${checkedName(name)}" is saved here.`);
  }
  let state: Partial<StateDocument>;
  try {
    state = JSON.parse(text) as Partial<StateDocument>;
  } catch {
    throw new BadStateName(`The state "${checkedName(name)}" is not readable: it is not JSON.`);
  }
  const record = (value: unknown): boolean => !!value && typeof value === 'object' && !Array.isArray(value);
  if (!record(state.nodes) || !record(state.gui) || (state.gui_shown !== undefined && !record(state.gui_shown))) {
    throw new BadStateName(`The state "${checkedName(name)}" does not hold nodes and gui as objects.`);
  }
  return { graph: String(state.graph ?? ''), saved_at: String(state.saved_at ?? ''), nodes: state.nodes!, gui: state.gui!, gui_shown: state.gui_shown ?? {} };
}
