// Which files a graph may reach.
//
// Two rules, both held where the files are touched (`nodeFiles`):
//
//  1. The settings file -- the keys -- is never read, written, listed or
//     removed, whoever names it.
//  2. A path written in a graph file is relative and stays below the folder
//     the tool runs in (`inProject`, with links followed). A path from the
//     person at run time is not held to that -- unless the tool is served
//     beyond this machine (`confineEverything`): then nobody's is.
//
// The folder is the working directory: a deployed tool and the MCP server run
// in their project folder, and the editor in the folder it was started in.

import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { secretPaths } from '../ai/settings.ts';
import { ownPathProblem } from '../nodes/ownPath.ts';

/** Whether *path* is *folder* or lies in it (compared the way the platform compares names). */
export function inside(folder: string, path: string): boolean {
  const way = relative(folder, path);
  return way === '' || (!way.startsWith('..') && !isAbsolute(way));
}

/** *path* with links followed as far as it exists, so a file not yet written is placed too. */
function real(path: string): string {
  let head = resolve(path);
  let rest = '';
  while (!existsSync(head)) {
    const up = dirname(head);
    if (up === head) return resolve(path);
    rest = join(basename(head), rest);
    head = up;
  }
  return join(realpathSync(head), rest);
}

/** *path* resolved below the working directory, or an error saying why a graph may not name it. */
export function inProject(path: string): string {
  const problem = ownPathProblem(path);
  if (problem) throw new Error(problem);
  const full = resolve(path);
  if (!inside(real('.'), real(full))) throw new Error(`"${path}" leads out of the folder the tool runs in, through a link.`);
  return full;
}

let everything = false;

/** A tool served beyond this machine reads and writes below its folder only, whoever names the path. */
export function confineEverything(on = true): void {
  everything = on;
}

/** *path*, if a file service may touch it at all; else an error. */
export function reachable(path: string): string {
  const here = real(path);
  if (secretPaths().some((key) => relative(real(key), here) === '')) throw new Error("A file that holds keys or a command to start (the settings, a tool server's server.json) is not for a graph to touch.");
  if (everything && !inside(real('.'), here)) throw new Error(`"${path}" is outside the folder this tool runs in, which a tool served beyond this machine may not touch.`);
  return path;
}
