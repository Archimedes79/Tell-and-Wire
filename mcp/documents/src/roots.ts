// Which files this server may read: those inside the folders it was started
// with, and no others.
//
// A path a model writes -- and a model reads strangers' text -- must not reach
// ~/.ssh or the editor's ai-settings.json. A path is judged by where it really
// points: links and `..` are resolved first, and only then must it lie inside
// a root.

import { readdir, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { UserError } from './errors.ts';

export class AccessError extends UserError {}

/** The folders as real, existing folders. */
export async function openRoots(given: string[]): Promise<string[]> {
  const roots: string[] = [];
  for (const path of given) {
    let real: string;
    try {
      real = await realpath(resolve(path));
    } catch {
      throw new AccessError(`"${path}" does not exist`);
    }
    if (!(await stat(real)).isDirectory()) throw new AccessError(`"${path}" is not a folder`);
    roots.push(real);
  }
  return roots;
}

/** Whether *path* is *root* or lies below it. `..x` is a name; `..` is the way up. */
const inside = (root: string, path: string): boolean => {
  const way = relative(root, path);
  return way === '' || (way !== '..' && !way.startsWith(`..${sep}`) && !isAbsolute(way));
};

// One answer for "not there" and "not allowed": which of the two it is would tell a
// model what exists outside the folders.
const NOT_THERE = 'not found in the folders this server may read';

/**
 * The real path of *input* -- a file or a folder, as *kind* says -- if it lies inside a root.
 * A relative path is relative to the first root.
 */
export async function resolveInside(roots: string[], input: string, kind: 'file' | 'folder'): Promise<string> {
  if (!input.trim() || input.includes('\0')) throw new AccessError('that is not a path');
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) throw new AccessError('only paths of files are read, not addresses');
  let real: string;
  try {
    real = await realpath(isAbsolute(input) ? input : resolve(roots[0], input));
  } catch {
    throw new AccessError(NOT_THERE);
  }
  if (!roots.some((root) => inside(root, real))) throw new AccessError(NOT_THERE);
  const info = await stat(real);
  if (kind === 'file' && !info.isFile()) throw new AccessError('that is a folder, not a file');
  if (kind === 'folder' && !info.isDirectory()) throw new AccessError('that is a file, not a folder');
  return real;
}

/** A path as it is told to a model: relative to the root it lies in, with slashes. */
export function shown(roots: string[], real: string): string {
  const root = roots.find((candidate) => inside(candidate, real));
  return root ? relative(root, real).split(sep).join('/') || '.' : real;
}

export interface Entry {
  name: string;
  kind: 'file' | 'folder';
  size: number;
}

/** What is directly in a folder inside a root: sub-folders, and the files *wanted* says are of interest. Dot files are not shown. */
export async function listInside(
  roots: string[], folder: string | undefined, wanted: (name: string) => boolean, limit = 200,
): Promise<{ folder: string; entries: Entry[]; truncated: boolean }> {
  const real = folder?.trim() ? await resolveInside(roots, folder, 'folder') : roots[0];
  const entries: Entry[] = [];
  for (const item of await readdir(real, { withFileTypes: true })) {
    if (item.name.startsWith('.')) continue;
    if (item.isDirectory()) entries.push({ name: item.name, kind: 'folder', size: 0 });
    else if (item.isFile() && wanted(item.name)) entries.push({ name: item.name, kind: 'file', size: (await stat(resolve(real, item.name))).size });
  }
  entries.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'folder' ? -1 : 1));
  return { folder: shown(roots, real), entries: entries.slice(0, limit), truncated: entries.length > limit };
}
