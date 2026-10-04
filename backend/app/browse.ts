// Walking the machine's files, for a picker.
//
// Not editor-only, and that is the point: a deployed tool's picker shows
// folders, the parent and the drives too, so whoever was handed the tool is
// not held to one directory.
//
// The route is a `local` one (`api.ts`): it is the person at the keyboard
// browsing their own machine, who can open a file manager beside the tool and
// do the same thing. Listing a parent directory reveals nothing to anyone the
// file picker was not already for.
//
// What stays behind in `graph-editor/files.ts` is what a recipient has no
// business with: looking for project folders, handing a node's file to an
// editor.

import { access, readdir, stat } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';

import type { BrowseEntry, BrowsePage } from './api.ts';
import { FLOW_FILE } from './project/flow.ts';
import { NotFound } from '../../graph/errors.ts';

const exists = (path: string): Promise<boolean> => access(path).then(() => true, () => false);

/** Whether *path*, a folder, is a project: it holds a `flow.json`. */
const isProject = (path: string): Promise<boolean> => exists(join(path, FLOW_FILE));

/** A drive that answers within a second: a disconnected network drive can take far longer to say no. */
const answers = (drive: string): Promise<boolean> => new Promise((done) => {
  const late = setTimeout(() => done(false), 1000);
  void exists(drive).then((there) => { clearTimeout(late); done(there); });
});

/** The drives found, and when: looked for again after half a minute, not on every page. */
let drives: { at: number; found: Promise<string[]> } | null = null;

/** Where a browser can jump to: home, plus the drives that exist on Windows and `/` elsewhere. */
async function filesystemRoots(): Promise<string[]> {
  if (platform() !== 'win32') return [homedir(), '/'];
  if (!drives || Date.now() - drives.at > 30_000) {
    const letters = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((letter) => `${letter}:\\`);
    drives = { at: Date.now(), found: Promise.all(letters.map(answers)).then((there) => letters.filter((_, at) => there[at])) };
  }
  return [homedir(), ...await drives.found];
}

/**
 * Where an empty path starts the editor's picker: the folder it was started
 * in -- unless that is the program's own (it holds `backend/app/main.ts` or a
 * launcher), where nothing a person works on is -- then their home.
 */
export async function startFolder(started = process.cwd()): Promise<string> {
  const program = await Promise.all(['backend/app/main.ts', 'run.cmd', 'run.sh'].map((file) => exists(join(started, file))));
  return program.includes(true) ? homedir() : started;
}

/**
 * One page of a file browser: the directory, its parent, its children.
 *
 * Exists because the server resolves *real* paths while a browser's file input
 * only ever reveals a name — so a picker has to browse the machine the graph
 * will run on. Hidden entries are left out; an unreadable child is skipped
 * rather than failing the page, since one denied entry should not make a
 * directory unbrowsable.
 *
 * @param path where to look; empty means *home*.
 * @param home where an empty path starts. The editor passes `startFolder()`, a
 *   deployed tool the folder its graph sits in — in both cases the root of the
 *   thing being used, rather than a home directory full of dot-folders that has
 *   nothing to do with it.
 */
export async function browse(path: string, extensions: string[] = [], home = process.cwd()): Promise<BrowsePage> {
  let root = path ? resolve(path.replace(/^~(?=$|[\\/])/, homedir())) : resolve(home);
  const info = await stat(root).catch(() => null);
  if (!info) throw new NotFound(`Directory not found: ${root}`);
  if (!info.isDirectory()) root = dirname(root);

  const directories: BrowseEntry[] = [];
  const files: BrowseEntry[] = [];
  const entries = (await readdir(root, { withFileTypes: true })).filter((entry) => !entry.name.startsWith('.'));
  // Whether each folder is a project, asked of all at once.
  const projects = await Promise.all(entries.map((entry) => entry.isDirectory() && isProject(join(root, entry.name))));
  entries.forEach((entry, at) => {
    const full = join(root, entry.name);
    if (entry.isDirectory()) directories.push({ name: entry.name, path: full, is_dir: true, ...(projects[at] ? { project: true } : {}) });
    else if (!extensions.length || extensions.includes(extname(entry.name).toLowerCase())) files.push({ name: entry.name, path: full, is_dir: false });
  });
  const byName = (a: BrowseEntry, b: BrowseEntry) => a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  directories.sort(byName);
  files.sort(byName);

  const parent = dirname(root);
  return {
    path: root,
    parent: parent === root ? null : parent,
    entries: [...directories, ...files],
    roots: await filesystemRoots(),
    // The folder shown can be a project itself: a picker opened inside one can open it.
    ...(await isProject(root) ? { project: true } : {}),
  };
}
