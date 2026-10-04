// What the MCP server's tools may touch, and what they may say.
//
// THE CONFINEMENT RULES. The caller is a model acting on text it read somewhere,
// so every argument is treated as written by a stranger. Each rule has a test
// (`mcpServer.test.ts`, "confinement").
//
//   1. Every path argument is resolved against the root and must stay inside
//      it -- `..`, an absolute path elsewhere and another drive are all the same
//      refusal. Checked twice: as written, and again where the path *really*
//      leads once links are followed, because a link inside the root is a door
//      out of it.
//   2. Only a `.json` path is taken, and never under a dot-folder or
//      `node_modules`: what `list_graphs` would not show, nothing else touches.
//      A project is named by its `flow.json`, and its nodes' files -- code.js,
//      prompt.md, history.md -- are read and written with it, inside the root.
//   3. A file that exists is overwritten only if it is already a graph. That is
//      what stops `save_graph` from being "write any JSON file" -- it cannot
//      replace `package.json`, because `package.json` has no `nodes`. (`tools.ts`)
//   4. `ai-settings.json` is never opened by a tool, under any name that reaches
//      it. It holds the keys.
//   5. Nothing returned contains an environment variable, a key or settings
//      content. A provider's error message passes through, because it is how a
//      person finds out their model name is wrong; whatever in it matches a
//      configured secret is blanked first, and so is every other result.
//   6. What comes in is bounded (a description, a graph, one protocol line) and
//      so is what goes out: a run reports each value cut to a few hundred
//      characters, because a graph that reads a 5 MB file should not push 5 MB
//      through a model's context. (`spec.ts`, `tools.ts`, `transport.ts`)
//
// This file holds rules 1, 2, 4 and 5.
//
// What this does **not** confine is a graph that runs. `run_graph` executes code
// nodes, in the same sandbox every run uses (`sandbox` in `graph/core/node.ts`): no
// child processes, no native addons, no workers; it reads the working directory --
// which `runMcpServer` moves into the root -- but not the settings file, and writes
// the temp folder only. The network stays open. A body can still read another
// file by path, through a `file_path` input the executor reads for it. So the root
// is a fence around what the *tools* touch, not around what a graph's own code
// touches. Point it at a project folder, not at a home directory.

import { realpath } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { candidatePaths, SETTINGS_FILENAME } from '../../../graph/ai/settings.ts';

/** Folders no tool goes into, besides the dot-folders: `list_graphs` leaves them out as well. */
export const SKIPPED_FOLDERS = new Set(['node_modules', 'dist']);

/**
 * The tool said no, and the sentence is for the model that asked.
 *
 * Its own type so that the one place turning failures into results can tell a
 * refusal it wrote from an exception it did not expect -- both come back as
 * `isError`, but only one of them is worded for a reader.
 */
export class Refused extends Error {}

/**
 * The refusal that is about the document rather than about where it is.
 * `validate_graph` reports this one as a finding: "is this a graph?" was the
 * question, and "no, because" is an answer to it, not a failure to answer.
 */
export class BadDocument extends Refused {}

const fold = (path: string): string => (process.platform === 'win32' ? path.toLowerCase() : path);

/**
 * Where *path* really is: its deepest existing ancestor with links followed,
 * and the rest put back on. A file about to be created has no real path of its
 * own, but the folder it would land in does.
 */
async function real(path: string): Promise<string> {
  const rest: string[] = [];
  let head = path;
  for (;;) {
    try {
      return join(await realpath(head), ...rest.reverse());
    } catch {
      const up = dirname(head);
      if (up === head) return path;
      rest.push(basename(head));
      head = up;
    }
  }
}

/** With the separator, or `/work/graphs-old` counts as inside `/work/graphs`. */
const prefixOf = (root: string): string => (root.endsWith(sep) ? root : root + sep);
const isUnder = (root: string, full: string): boolean => fold(full).startsWith(fold(prefixOf(root)));

/** Rules 1, 2 and 4, for one spelling of a path. Throws the refusal; returns nothing. */
function mustBeInside(root: string, full: string, given: string): void {
  const prefix = prefixOf(root);
  if (!isUnder(root, full)) {
    throw new Refused(
      `"${given}" is outside the folder this server is confined to. `
      + 'Give a path relative to that folder, such as "graphs/my_graph.json".',
    );
  }
  const within = full.slice(prefix.length);
  // A colon inside the root is not a drive letter. On Windows it is an
  // alternate data stream: `notes.exe:x.json` ends in `.json` and writes into
  // `notes.exe`.
  if (/[<>:"|?*]/.test(within) || [...within].some((char) => char.charCodeAt(0) < 32)) {
    throw new Refused(`"${given}" contains characters a file name cannot be trusted with.`);
  }
  if (within.split(sep).some((part) => part.startsWith('.') || SKIPPED_FOLDERS.has(part.toLowerCase()))) {
    throw new Refused(`"${given}" is under a dot-folder, node_modules or dist. Graphs do not live there, and this server does not go there.`);
  }
  if (extname(full).toLowerCase() !== '.json') {
    throw new Refused(`"${given}" is not a .json file. A graph is a .json file -- a project is named by its flow.json -- and that is the only path this server takes.`);
  }
  const settings = candidatePaths(root).map((path) => fold(resolve(path)));
  if (basename(full).toLowerCase() === SETTINGS_FILENAME || settings.includes(fold(full))) {
    throw new Refused(`"${given}" is this machine's AI settings file. It holds credentials, and no tool here opens it.`);
  }
}

/** The doors onto *folder*: the path a tool may use (`confine`), the same for a file of a project (`insideRoot`), and a path as the caller may see it. */
export function confinement(folder: string): {
  confine: (given: unknown, argument: string) => Promise<string>;
  insideRoot: (path: string) => Promise<void>;
  shown: (full: string) => string;
} {
  const root = resolve(folder);
  let realRoot: Promise<string> | undefined;

  /** Rules 1, 2 and 4: the path a tool may use, or the refusal. */
  const confine = async (given: unknown, argument: string): Promise<string> => {
    if (typeof given !== 'string' || !given.trim()) {
      throw new Refused(`"${argument}" must be a .json path relative to the server's folder, such as "graphs/my_graph.json".`);
    }
    const full = resolve(root, given.trim());
    mustBeInside(root, full, given);
    // And again where it really leads: a link inside the root is a way out of it.
    realRoot ??= real(root);
    mustBeInside(await realRoot, await real(full), given);
    return full;
  };

  /** The path as the caller may see it: relative, forward slashes, nothing of the machine above the root. */
  const shown = (full: string): string => full.slice(root.length).split(sep).filter(Boolean).join('/');

  /**
   * Rule 1 for the files of a project: its code and prompts live in
   * `nodes/…` beside the `flow.json` that was confined, and a link among them
   * is a way out of the folder like any other. Their extensions are their own.
   */
  const insideRoot = async (path: string): Promise<void> => {
    realRoot ??= real(root);
    if (!isUnder(root, path) || !isUnder(await realRoot, await real(path))) {
      throw new Refused(`"${shown(path)}" leads outside the folder this server is confined to.`);
    }
  };

  return { confine, insideRoot, shown };
}

/** Shapes a key tends to have, for the one that arrives from somewhere nobody configured. */
const KEY_SHAPED = /\b(sk-[A-Za-z0-9_-]{20,}|AIza[A-Za-z0-9_-]{30,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/g;

/** Rule 5: text with every secret *secrets* names -- asked for each time -- and every key-shaped string blanked. */
export function scrubber(secrets?: () => string[]): (text: string) => string {
  return (text) => {
    let clean = text;
    for (const secret of secrets?.() ?? []) {
      if (typeof secret === 'string' && secret.length >= 8) clean = clean.split(secret).join('[redacted]');
    }
    return clean.replace(KEY_SHAPED, '[redacted]');
  };
}
