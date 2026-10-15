// Finding a file that was dropped onto a page: a browser hands a page the name and size of a dropped file, never where it is.
//
// What someone drops is almost always in the folder the tool (or the editor) was started in, so that is where it is looked for -- in the folder and
// a few levels below it. Here and not in the editor's files because a deployed tool's file picker takes a drop too (`api.ts`, `findFile`).

import type { Dirent } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

/** Folders a search passes over: dependencies and build output -- and every name that begins with a dot. */
const SKIPPED = new Set(['node_modules', 'dist', 'build']);

/** How many levels of folders below the one it starts in a search looks into. */
const FOLDERS_BELOW = 3;

/**
 * What is in the folder *root* and the folders below it, as far down as `searchedIn` says: each entry is handed to *take*, and the paths it
 * takes are the answer. A folder it takes is not looked into.
 */
export async function walkUnder(root: string, take: (path: string, entry: Dirent) => boolean | Promise<boolean>): Promise<string[]> {
  const found: string[] = [];
  const walk = async (directory: string, below: number): Promise<void> => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || (entry.isDirectory() && SKIPPED.has(entry.name))) continue;
      const path = join(directory, entry.name);
      if (await take(path, entry)) found.push(path);
      else if (entry.isDirectory() && below < FOLDERS_BELOW) await walk(path, below + 1);
    }
  };
  await walk(root, 0);
  return found;
}

/** Files named *name*, of *size* bytes, under *root*: the size tells two of one name apart. */
export async function findFiles(root: string, name: string, size: number): Promise<string[]> {
  return walkUnder(root, async (path, entry) => !entry.isDirectory() && entry.name === name
    && (await stat(path).catch(() => null))?.size === size);
}

/** Where a search under *root* looks, in words: what a drop that found nothing says. */
export function searchedIn(root: string): string {
  return `${root} and ${FOLDERS_BELOW} levels of folders below it, leaving out ${[...SKIPPED].join(', ')} and every name that begins with a dot`;
}
