import { NodeRunner } from '../NodeRunner.ts';
import type { Runtime } from '../../../../../graph/nodes/Runtime.ts';
import type { GraphNode } from '../../../../../graph/graph.ts';
import { WRITE_PATH_PORT, type EndNodeDefinition } from '../../../../../graph/nodes/end/EndNodeDefinition.ts';

/** Hands on what arrives -- the run's result -- and writes it to a file or a folder where asked. */
export class EndNodeRunner extends NodeRunner<EndNodeDefinition> {
  async execute(node: GraphNode, inputs: Record<string, unknown>, runtime: Runtime): Promise<Record<string, unknown>> {
    const settings = this.kind.config(node);
    // A wired `path` sets the target at run time and always wins over the
    // configured one; it is a control input, not a value to report back.
    const target = inputs[WRITE_PATH_PORT] ? runtime.files.resolve(String(inputs[WRITE_PATH_PORT])) : settings.mode !== 'none' && settings.path ? runtime.files.inProject(settings.path) : '';
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
      const path = inFolder(folder, `${safe(name)}.${text ? 'txt' : 'json'}`);
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
function namedFor(file: string, id: string): boolean {
  const port = safe(id);
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

/** *name* as one safe file name: no separator, no `..`, so a port called `../../x` stays in its folder. */
const safe = (name: string): string => name.replace(/[^\p{L}\p{N}_.-]/gu, '_').replace(/\.\./g, '_');

/**
 * *name* inside *folder*, in the separator the folder is already written in.
 */
function inFolder(folder: string, name: string): string {
  if (/[\\/]/.test(name) || name.includes('..')) throw new Error(`"${name}" is not a file name inside the folder.`);
  const separator = folder.includes('\\') && !folder.includes('/') ? '\\' : '/';
  return `${folder.replace(/[\\/]+$/, '')}${separator}${name}`;
}
