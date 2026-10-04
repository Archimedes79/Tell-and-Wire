import { NodeRunner, type WhatRuns } from '../../NodeRunner.ts';
import { type Runtime } from '../../Runtime.ts';
import { type GraphNode, type Port } from '../../../graph.ts';
import { listFolder } from '../../folderListing.ts';
import { port } from '../../port.ts';
import { errorOutput } from '../../../execution/wiring.ts';

export interface FolderConfig {
  /** The folder it lists, unless one arrives on its `path` input. */
  path: string;
  recursive: boolean;
  extensions: string;
}

/** What a port holds, in words: one of them, and a list of them. */
const HOLDS: Record<string, [string, string]> = {
  number: ['a number', 'numbers'], file_path: ['a file path', 'file paths'],
};

/** A port for the graph designer: `"count" (a number, how many files were listed)`. */
function portInWords(port: Port): string {
  const [one, many] = HOLDS[port.data_type] ?? [port.data_type, port.data_type];
  const what = port.description ? `, ${port.description.charAt(0).toLowerCase()}${port.description.slice(1)}` : '';
  return `"${port.id}" (${port.multi ? `a list of ${many}` : one}${what})`;
}

/**
 * The files in a folder: its paths on `files`, how many on `count`.
 *
 * It is a node that works, not a way into the graph: what comes from outside
 * comes through a start point (`start`), and a folder somebody chooses is a
 * path in its package, wired into `path`. Listing is the folder, its file
 * types and its subfolders, and nothing else: keeping only some of the files
 * is a code node after it.
 *
 * It reads no file. The node that wants a file's text reads it at its own
 * input ("Read the file at this path").
 */
export class FolderNodeRunner extends NodeRunner<FolderConfig> {
  readonly nodeType = 'folder' as const;

  config(node: GraphNode): FolderConfig {
    const c = node.config;
    return {
      path: String(c.path ?? ''),
      recursive: c.recursive === true,
      extensions: String(c.extensions ?? ''),
    };
  }

  override derivedPorts(node: GraphNode) {
    // A folder that cannot be listed is the one thing here that can fail at
    // run time.
    const error = this.catchesErrors(node) ? [errorOutput('Set when the listing failed; empty otherwise')] : [];
    return {
      inputs: [port('path', 'Path', 'input', 'file_path', false, 'Override the configured path')],
      outputs: [
        port('files', 'Files', 'output', 'file_path', true, 'Rooted file paths'),
        port('count', 'Count', 'output', 'number', false, 'How many files were listed'),
        ...error,
      ],
    };
  }

  /** A folder's files are what is in it now: listed again every round. */
  override readonly readsOutside = true;

  async execute(node: GraphNode, inputs: Record<string, unknown>, runtime: Runtime) {
    const settings = this.config(node);
    // The wired path wins over the configured one -- what the port promises
    // ("Override the configured path") and what the end point does with its
    // own `path`. A wire that brought nothing is nothing, and leaves the
    // configured path standing.
    const raw = String(inputs.path ?? '').trim() || settings.path;
    // An empty path is not a failure -- nothing was asked for -- so the error
    // port, when there is one, says so by staying empty. A listing that throws
    // is caught by the executor, which fills the port this element declared.
    const files = raw ? await listFolder(raw, settings, runtime) : [];
    return { files, count: files.length, ...(this.catchesErrors(node) ? { error: '' } : {}) };
  }

  // ── Build time ────────────────────────────────────────────────────────────

  /**
   * Its settings, and its ports said from `derivedPorts` itself: a hand-kept
   * list of them once named the count without saying it is a number, and a
   * graph built on it added "3" to "4".
   */
  override graphAuthorNote(): string {
    const { inputs, outputs } = this.derivedPorts({ id: 'f', config: {} } as unknown as GraphNode);
    return 'lists the files in a folder. config.path is the folder; a path wired into its input "path" is listed instead. '
      + 'config.extensions (e.g. ".csv, .txt") keeps only those types, config.recursive = true looks into subfolders too; '
      + 'to keep only some of the files, wire a code node after it. It reads no file, and it is no way into the graph: '
      + 'a folder somebody chooses arrives in a start point\'s package, wired into "path". '
      + `Its ports are DERIVED, not taken from this document: outputs ${outputs.map(portInWords).join(' and ')}; input ${inputs.map(portInWords).join(' and ')}.`;
  }

  override whatRuns(): WhatRuns {
    return this.engineRuns('Lists the folder whose path arrives on "path" (or the one it names) -- its file types, and its subfolders when it looks into them -- and hands on the files as "files".');
  }

  override referencedPaths(node: GraphNode): string[] {
    const { path } = this.config(node);
    return path ? [path] : [];
  }
}
