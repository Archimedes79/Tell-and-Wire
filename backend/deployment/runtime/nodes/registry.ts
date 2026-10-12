// The registry of runners: what runs each kind of node in a deployed tool.
//
// Built from the definitions (`graph/nodes/registry.ts`): a runner is the
// definition of its kind, and what that kind does when it runs.

import type { NodeType } from '../../../../graph/graph.ts';
import { NODES } from '../../../../graph/nodes/registry.ts';
import type { NodeRunner, Runners } from './NodeRunner.ts';
import { StartNodeRunner } from './start/StartNodeRunner.ts';
import { AiNodeRunner } from './ai/AiNodeRunner.ts';
import { CodeNodeRunner } from './code/CodeNodeRunner.ts';
import { DataNodeRunner } from './data/DataNodeRunner.ts';
import { EndNodeRunner } from './end/EndNodeRunner.ts';
import { SubgraphNodeRunner } from './subgraph/SubgraphNodeRunner.ts';

const RUNNERS: Record<NodeType, new (kind: never) => NodeRunner> = {
  start: StartNodeRunner,
  ai: AiNodeRunner,
  code: CodeNodeRunner,
  data: DataNodeRunner,
  end: EndNodeRunner,
  subgraph: SubgraphNodeRunner,
};

const RUNNERS_BY_TYPE = new Map<string, NodeRunner>(
  NODES.map((kind) => [kind.nodeType, new RUNNERS[kind.nodeType](kind as never)]),
);

/** The registry the executor asks. An unknown type is a missing runner, not a crash. */
export const runners: Runners = {
  node(type: string): NodeRunner | undefined {
    return RUNNERS_BY_TYPE.get(type);
  },
};
