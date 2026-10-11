import { NodeDesign, type WhatRuns } from '../NodeDesign.ts';
import type { GraphNode } from '../../../graph.ts';
import type { Kinds } from '../../../nodes/NodeDefinition.ts';
import type { Problem } from '../../../wiring.ts';
import { ownPathProblem } from '../../../nodes/ownPath.ts';
import { WRITE_PATH_PORT, type EndNodeDefinition } from '../../../nodes/end/EndNodeDefinition.ts';

export class EndNodeDesign extends NodeDesign<EndNodeDefinition> {
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
  override problems(node: GraphNode, _kinds: Kinds, where: string, wired: ReadonlySet<string> = new Set()): Problem[] {
    const { mode, path } = this.kind.config(node);
    if (mode === 'none') return [];
    const outside = path.trim() ? ownPathProblem(path.trim()) : null;
    if (outside) return [{ where, problem: outside, fix: `Write the path relative to the tool's folder, or wire a path into its "path".` }];
    if (path.trim() || wired.has(WRITE_PATH_PORT)) return [];
    const what = mode === 'file' ? 'a file' : 'a folder';
    return [{
      where,
      problem: `It writes to ${what}, and names none: nothing is written.`,
      fix: `Name ${what} for it to write to (config.path), wire a path into its "path", or let it write nowhere (write_mode "none").`,
    }];
  }

  override whatRuns(node: GraphNode): WhatRuns {
    const { mode } = this.kind.config(node);
    if (mode === 'file') return this.graphRuns('Writes what arrives to its file and hands it on, with "written_path".');
    if (mode === 'directory') {
      return this.graphRuns('Writes each value that arrives -- each item of a list -- to a file of its own in its folder, and hands it on, with "written_paths".');
    }
    return this.graphRuns('Hands on what arrives: the run\'s result, under its label, to whoever ran the graph.');
  }
}
