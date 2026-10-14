// The registry of designs: what the editor asks of each kind of node.
//
// Built from the definitions (`graph/nodes/registry.ts`): a design is the
// definition of its kind, and what only building asks of that kind.

import type { NodeType } from '../../graph.ts';
import { NODES } from '../../nodes/registry.ts';
import type { Designs, NodeDesign } from './NodeDesign.ts';
import { StartNodeDesign } from './start/StartNodeDesign.ts';
import { AiNodeDesign } from './ai/AiNodeDesign.ts';
import { CodeNodeDesign } from './code/CodeNodeDesign.ts';
import { DataNodeDesign } from './data/DataNodeDesign.ts';
import { EndNodeDesign } from './end/EndNodeDesign.ts';
import { SubgraphNodeDesign } from './subgraph/SubgraphNodeDesign.ts';

const DESIGNS: Record<NodeType, new (kind: never, designs: Designs) => NodeDesign> = {
  start: StartNodeDesign,
  ai: AiNodeDesign,
  code: CodeNodeDesign,
  data: DataNodeDesign,
  end: EndNodeDesign,
  subgraph: SubgraphNodeDesign,
};

/** The registry the editor asks. An unknown type is a missing design, not a crash. */
export const designs: Designs = {
  node(type: string): NodeDesign | undefined {
    return DESIGNS_BY_TYPE.get(type);
  },
};

const DESIGNS_BY_TYPE = new Map<string, NodeDesign>(
  NODES.map((kind) => [kind.nodeType, new DESIGNS[kind.nodeType](kind as never, designs)]),
);
