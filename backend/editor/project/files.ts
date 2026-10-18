// The editor's view of the machine's files: finding projects and dropped
// files, and handing a node's file to the editor the person works in.
//
// Editor-only, on purpose: none of it belongs in a package, which carries no
// `editor` folder. Browsing is not here: a deployed tool needs a file picker that
// can be navigated too, so it is `backend/deployment/host/browse.ts`, which a package carries.

import { existsSync } from 'node:fs';
import { basename, extname, resolve, sep } from 'node:path';
import { platform } from 'node:os';

import { isProjectFolder } from '../../deployment/project/folder.ts';
import { walkUnder } from '../../deployment/host/find.ts';
// One "there is nothing there" for everything on this side of the wire, so a
// route that turns it into a 404 needs one check rather than a list.
import { NotFound } from '../../../graph/errors.ts';
import { NODES } from '../../../graph/nodes/registry.ts';

/** Project folders named *name* under where the editor runs (`walkUnder`): for a folder dropped onto the editor. */
export async function findProjects(name: string): Promise<string[]> {
  const root = process.cwd();
  if (basename(root) === name && isProjectFolder(root)) return [root];
  return walkUnder(root, (path, entry) => entry.isDirectory() && entry.name === name && isProjectFolder(path));
}

// ---------------------------------------------------------------------------
// Handing a node's file to the person's own editor
// ---------------------------------------------------------------------------

export class NotOpenable extends Error {}

/**
 * What a node keeps its writing in -- input.js, code.js, prompt.md, data.json,
 * history.md: the files the nodes say they keep (`NodeDefinition.texts`), so a
 * node for another language brings its own. Nothing else is ever handed to
 * another program.
 */
const OPENABLE = new Set([
  ...NODES.flatMap((element) => element.texts({ config: {} } as never).map((text) => extname(text.file).toLowerCase())),
  // and the files beside a code node's code.js
  '.mjs', '.cjs', '.csv', '.txt',
]);

/**
 * What opens *path* when VS Code is not there: a text editor, never the
 * system's "open" -- which on Windows runs a .js with Windows Script Host,
 * outside every sandbox. Notepad is on every Windows; a Mac opens its default
 * text editor with `open -t`; elsewhere the desktop's opener decides.
 */
function textEditorFor(path: string): { command: string; args: string[] } {
  const system = platform();
  if (system === 'win32') return { command: 'notepad.exe', args: [path] };
  if (system === 'darwin') return { command: 'open', args: ['-t', path] };
  return { command: 'xdg-open', args: [path] };
}

/**
 * Open one of a graph's node files in the editor the person actually works in.
 *
 * The box in the node's panel is fine for an edit; an afternoon's work wants a
 * language server, a debugger's view, a second monitor. The file is already
 * there -- "keep this in a file beside the graph" -- so the missing piece was
 * only the way to it.
 *
 * Narrow on purpose, because this starts a program on the machine: the path
 * must be an existing text file (`OPENABLE`) inside the project folder -- one of
 * a node's texts, which `nodeFileOf` has checked -- so a page cannot use it to
 * launch an arbitrary file. VS Code is tried first, by
 * its `code` command, since that is where a `.js` with a JSDoc header is most
 * useful; without it, a text editor (`textEditorFor`).
 */
export async function openExternal(projectDir: string, relative: string): Promise<{ path: string; with: string }> {
  const root = resolve(projectDir);
  const path = resolve(root, relative);
  if (!path.startsWith(root + sep)) throw new NotOpenable('That file is not one of this project\'s node files.');
  if (!OPENABLE.has(extname(path).toLowerCase())) {
    throw new NotOpenable(`Only a node's text can be opened this way: a ${[...OPENABLE].join(', ')} file.`);
  }
  if (!existsSync(path)) throw new NotFound(`${path} does not exist yet. Save the graph first: saving is what writes it.`);

  const windows = platform() === 'win32';
  // On Windows a program is looked for in the working directory first (by cmd.exe, and by
  // Node itself): a `code.cmd` or `notepad.exe` put there would run. So it is started from
  // the system folder, which only an administrator writes to.
  const cwd = windows ? process.env.SystemRoot : undefined;
  const { spawn } = await import('node:child_process');
  const start = (command: string, args: string[], shell: boolean): Promise<boolean> => new Promise((done) => {
    try {
      const child = spawn(command, args, { detached: !shell, stdio: 'ignore', shell, windowsHide: true, cwd });
      child.on('error', () => done(false));
      if (shell) {
        // Through a shell, "started" only means the shell did. Whether the
        // command exists is its exit code: `code` returns 0 as soon as it has
        // handed the file over, and a shell that cannot find it returns 1.
        const patience = setTimeout(() => done(true), 5000);
        child.on('exit', (code) => { clearTimeout(patience); done(code === 0); });
        return;
      }
      child.on('spawn', () => { child.unref(); done(true); });
    } catch {
      done(false);
    }
  });

  // `code` is a .cmd shim on Windows, which only a shell can start; quoted, because a path may hold spaces.
  if (await start(windows ? `code -g "${path}"` : 'code', windows ? [] : ['-g', path], windows)) {
    return { path, with: 'VS Code' };
  }
  const editor = textEditorFor(path);
  if (await start(editor.command, editor.args, false)) return { path, with: windows ? 'Notepad' : 'a text editor' };
  throw new NotOpenable(`Nothing on this machine could open ${path}.`);
}
