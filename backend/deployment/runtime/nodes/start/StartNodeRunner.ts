import { NodeRunner } from '../NodeRunner.ts';
import type { Runtime } from '../../../../../graph/nodes/Runtime.ts';
import type { GraphNode } from '../../../../../graph/graph.ts';
import { START_PORT } from '../../../../../graph/triggers.ts';
import { readChosen } from '../../../../../graph/nodes/folderListing.ts';
import type { Package, StartNodeDefinition } from '../../../../../graph/nodes/start/StartNodeDefinition.ts';

/** Where a round begins: it hands on the package the round was started with. */
export class StartNodeRunner extends NodeRunner<StartNodeDefinition> {
  async execute(node: GraphNode, _inputs: Record<string, unknown>, runtime: Runtime) {
    const { startedBy, values, reads, path, recursive, extensions } = this.kind.config(node);
    const began = runtime.fired?.(START_PORT) ?? true;
    // Who, when nobody said: the graph's own clock, or a run of everything.
    const by = String(node.config.fired_by ?? (startedBy === 'itself' ? 'itself' : 'run'));
    // What is there to read is read now, each time: a folder is what is in it
    // this round, and one listed from before missed the file added since.
    const sends = reads
      // The path is written in the graph, which may be a stranger's: below the tool's folder only.
      ? { [node.id]: await readChosen({ path: path && runtime.files.inProject(path), directory: reads === 'folder', recursive, extensions, content: true }, runtime) }
      : values;
    const sent: Package = { event: began ? { name: node.id, by } : null, values: sends };
    return { [START_PORT]: sent };
  }
}
