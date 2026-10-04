// The runtime registry: every node a deployed tool can run.
//
// One list, built from the element classes themselves. The editor keeps its own
// registry of subclasses that add the config panels — this one is what a bundle
// imports, and it is the reason a bundle contains no editor. The blocks of a
// page are not run by the executor: the page asks them (`page.ts`), and
// `widgets/roster.ts` is their list.

import type { NodeRunner } from './NodeRunner.ts';
import type { NodeType } from '../graph.ts';
import { AiNodeRunner } from './ai/AiNodeRunner.ts';
import { CodeNodeRunner } from './code/CodeNodeRunner.ts';
import { DataNodeRunner } from './data/DataNodeRunner.ts';
import { FolderNodeRunner } from './folder/FolderNodeRunner.ts';
import { EndNodeRunner } from './end/EndNodeRunner.ts';
import { StartNodeRunner } from './start/StartNodeRunner.ts';
import { SubgraphNodeRunner } from './subgraph/SubgraphNodeRunner.ts';

/** In the order a person or a model is shown them: where a graph starts, what works, where it ends. */
export const NODES: NodeRunner<unknown>[] = [
  new StartNodeRunner(),
  new FolderNodeRunner(),
  new AiNodeRunner(),
  new CodeNodeRunner(),
  new DataNodeRunner(),
  new EndNodeRunner(),
  new SubgraphNodeRunner(),
] as NodeRunner<unknown>[];

const NODES_BY_TYPE = new Map<string, NodeRunner<unknown>>(
  NODES.map((element) => [element.nodeType, element]),
);

/** The registry the executor asks. An unknown type is a missing element, not a crash. */
export const registry = {
  node(type: NodeType | string): NodeRunner<unknown> | undefined {
    return NODES_BY_TYPE.get(type);
  },
  nodeTypes(): string[] {
    return [...NODES_BY_TYPE.keys()];
  },
};
