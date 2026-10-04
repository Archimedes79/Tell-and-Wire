import { NodeRunner, type WhatRuns } from '../../NodeRunner.ts';
import { type Runtime } from '../../Runtime.ts';
import { type GraphNode, type NodeResult, type Port } from '../../../graph.ts';
import type { Offer } from '../../../execution/graphInterface.ts';
import type { Runners } from '../../NodeRunner.ts';
import type { Problem } from '../../../execution/wiring.ts';

/**
 * The input that says *where* to write rather than *what*: a control input,
 * and the one port of an end point that is not part of its value.
 */
const WRITE_PATH_PORT = 'path';

export interface EndConfig {
  /** Where to write, when writing at all -- unless a path arrives on its `path` input. */
  path: string;
  mode: 'none' | 'file' | 'directory';
}

/**
 * Where a round ends: a named end point, and what the graph hands back --
 * everything wired into it, under its name -- and, if asked, a file or a
 * folder of it too. A page shows it by that name, a script reads it, and the
 * graph above has it on the port of the node that holds this graph.
 *
 * A passthrough, deliberately — it echoes its inputs so the run's result says
 * what arrived, rather than inventing a shape of its own. It does not *show*
 * anything either: showing is what the page is for, and a window of its own
 * would be a second place where results appear, with no relation to the page.
 * Its label is its one name in the result.
 */
export class EndNodeRunner extends NodeRunner<EndConfig> {
  readonly nodeType = 'end' as const;

  config(node: GraphNode): EndConfig {
    const c = node.config;
    const mode = String(c.write_mode ?? 'none');
    return {
      path: String(c.path ?? ''),
      mode: (['none', 'file', 'directory'].includes(mode) ? mode : 'none') as EndConfig['mode'],
    };
  }

  /** Everything a graph produces leaves through one of these. */
  override readonly isResult = true;

  /** What it is called on the canvas is what its value is called in the run's result: its label, or its id without one. */
  override resultLabel(node: GraphNode): string {
    return String(node.label ?? '').trim() || node.id;
  }

  override boundaryRole(): 'out' {
    return 'out';
  }

  override valuePorts(node: GraphNode): Port[] {
    return node.inputs.filter((port) => port.id !== WRITE_PATH_PORT);
  }

  /**
   * An output under its own id: what is wired into it. Where it writes is its
   * own setting, or the path wired into it -- from a start point's package,
   * when whoever uses the graph says where.
   */
  override offers(node: GraphNode): Offer[] {
    const carried = this.valuePorts(node);
    return [{
      kind: 'output', name: node.id, label: this.resultLabel(node), type: carried.length === 1 ? carried[0].data_type : 'any',
      ...(carried.length === 1 && carried[0].multi ? { list: true } : {}),
      ...(node.description ? { description: node.description } : {}),
    }];
  }

  /** What arrived: the one thing wired into it, or each of several by its port. */
  override shows(node: GraphNode, result: NodeResult): unknown {
    const carried = this.valuePorts(node);
    if (carried.length === 1) return result.inputs[carried[0].id] ?? null;
    return Object.fromEntries(carried.map((port) => [port.id, result.inputs[port.id] ?? null]));
  }

  async execute(node: GraphNode, inputs: Record<string, unknown>, runtime: Runtime): Promise<Record<string, unknown>> {
    const settings = this.config(node);
    // A wired `path` sets the target at run time and always wins over the
    // configured one; it is a control input, not a value to report back.
    const target = inputs[WRITE_PATH_PORT] ? runtime.files.resolve(String(inputs[WRITE_PATH_PORT])) : settings.path;
    const values: Record<string, unknown> = { ...inputs };
    delete values[WRITE_PATH_PORT];

    const result: Record<string, unknown> = { ...values };
    if (settings.mode === 'file' && target) {
      const present = Object.values(values).filter((v) => v !== null && v !== undefined);
      const content = present.length === 1 && typeof present[0] === 'string'
        ? present[0]
        : present.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join('\n');
      await runtime.files.write(target, content);
      result.written_path = target;
    } else if (settings.mode === 'directory' && target) {
      result.written_paths = await writeEach(target, values, runtime);
    }
    return result;
  }

  // ── Build time ────────────────────────────────────────────────────────────

  override graphAuthorNote(): string {
    return `what arrives on its inputs is the run's result, handed back to whoever ran the graph under the node's label; give every end point its own. `
      + `config.write_mode is none, file or directory: file also writes it to the file config.path names, directory each value to a file of its own in the folder config.path names. `
      + `A path wired into its input "path" -- a start point's package, when whoever uses the graph says where -- is written to instead.`;
  }

  /**
   * Set to write a file or a folder, and naming none -- neither in its
   * settings nor by a path wired into its `path` -- it writes nothing, and
   * says nothing about it while it does.
   */
  override problems(node: GraphNode, _elements: Runners, where: string, wired: ReadonlySet<string> = new Set()): Problem[] {
    const { mode, path } = this.config(node);
    if (mode === 'none' || path.trim() || wired.has(WRITE_PATH_PORT)) return [];
    const what = mode === 'file' ? 'a file' : 'a folder';
    return [{
      where,
      problem: `It writes to ${what}, and names none: nothing is written.`,
      fix: `Name ${what} for it to write to (config.path), wire a path into its "path", or let it write nowhere (write_mode "none").`,
    }];
  }

  override whatRuns(node: GraphNode): WhatRuns {
    const { mode } = this.config(node);
    if (mode === 'file') return this.engineRuns('Writes what arrives to its file and hands it on, with "written_path".');
    if (mode === 'directory') {
      return this.engineRuns('Writes each value that arrives -- each item of a list -- to a file of its own in its folder, and hands it on, with "written_paths".');
    }
    return this.engineRuns('Hands on what arrives: the run\'s result, under its label, to whoever ran the graph.');
  }
}

/**
 * Write every value to a file of its own in *folder*, and say which files.
 *
 * A list is what a node run once per item hands on -- a summary per file of a
 * folder -- so each item is a value of its own and gets a file of its own,
 * numbered by its place in the list: the third file is the third item's even
 * when the second failed and left a null, which writes nothing. Numbers are
 * padded to the length of the list so the files sort in its order. Text is
 * written as it is, as `.txt`; anything else as the JSON it is, as `.json`.
 *
 * The folder then holds this run's values and no earlier run's. The files an
 * earlier run wrote under these ports' names that this one did not write again
 * are removed: a failed item's slot kept the file from the run before, which
 * looked like a result of this one, and a list of another length left a second
 * set of numbers beside the first. Only files named the way this writes them
 * go; whatever else is in the folder stays.
 */
async function writeEach(folder: string, values: Record<string, unknown>, runtime: Runtime): Promise<string[]> {
  const written: string[] = [];
  for (const [portId, value] of Object.entries(values)) {
    const items = Array.isArray(value) ? value : [value];
    const width = String(items.length).length;
    for (const [index, item] of items.entries()) {
      if (item === null || item === undefined) continue;
      const name = Array.isArray(value) ? `${portId}_${String(index + 1).padStart(width, '0')}` : portId;
      const text = typeof item === 'string';
      const path = inFolder(folder, `${name}.${text ? 'txt' : 'json'}`);
      await runtime.files.write(path, text ? item : JSON.stringify(item, null, 2));
      written.push(path);
    }
  }
  await removeEarlier(folder, Object.keys(values), written, runtime);
  return written;
}

/** The last part of *path*, in either separator. */
const baseName = (path: string): string => path.split(/[\\/]/).pop() ?? path;

/** Whether *file* is a name `writeEach` gives a value of *port*: `value.txt`, `value_03.json`. */
function namedFor(file: string, port: string): boolean {
  const stem = file.replace(/\.(txt|json)$/, '');
  if (stem === file) return false;
  return stem === port || (stem.startsWith(`${port}_`) && /^\d+$/.test(stem.slice(port.length + 1)));
}

/** Remove from *folder* the files `writeEach` names after *ports* that are not among *kept*. */
async function removeEarlier(folder: string, ports: string[], kept: string[], runtime: Runtime): Promise<void> {
  const { files } = runtime;
  if (!files.remove || !ports.length) return;
  const keep = new Set(kept.map(baseName));
  let present: string[];
  try {
    present = await files.list(folder);
  } catch {
    // No folder: nothing was written, and nothing was left there before.
    return;
  }
  for (const path of present) {
    const name = baseName(path);
    if (!keep.has(name) && ports.some((port) => namedFor(name, port))) await files.remove(path);
  }
}

/**
 * *name* inside *folder*, in the separator the folder is already written in.
 * Spelled out rather than taken from `node:path`: an element also runs in the
 * editor's browser tab, where there is no such module.
 */
function inFolder(folder: string, name: string): string {
  const separator = folder.includes('\\') && !folder.includes('/') ? '\\' : '/';
  return `${folder.replace(/[\\/]+$/, '')}${separator}${name}`;
}
