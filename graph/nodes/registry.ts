// The registry of node kinds: every node a graph can hold, as its definition.
//
// One list, built from the definition classes themselves. It is what a tool
// carries and what the editor asks; the runners (`backend/deployment/runtime/nodes/`)
// and the designs (`graph/editor/nodes/`) are listed beside it, each by its
// own registry. The blocks of a gui are not nodes: the gui asks them
// (`gui/gui.ts`), and `widgets/roster.ts` there is their list.

import type { NodeDefinition } from './NodeDefinition.ts';
import type { NodeType } from '../graph.ts';
import { AiNodeDefinition } from './ai/AiNodeDefinition.ts';
import { CodeNodeDefinition } from './code/CodeNodeDefinition.ts';
import { DataNodeDefinition } from './data/DataNodeDefinition.ts';
import { EndNodeDefinition } from './end/EndNodeDefinition.ts';
import { StartNodeDefinition } from './start/StartNodeDefinition.ts';
import { SubgraphNodeDefinition } from './subgraph/SubgraphNodeDefinition.ts';

/** In the order a person or a model is shown them: where a graph starts, what works, where it ends. */
export const NODES: NodeDefinition[] = [
  new StartNodeDefinition(),
  new AiNodeDefinition(),
  new CodeNodeDefinition(),
  new DataNodeDefinition(),
  new EndNodeDefinition(),
  new SubgraphNodeDefinition(),
];

const NODES_BY_TYPE = new Map<string, NodeDefinition>(
  NODES.map((kind) => [kind.nodeType, kind]),
);

/** The registry the executor asks. An unknown type is a missing kind, not a crash. */
export const registry = {
  node(type: NodeType | string): NodeDefinition | undefined {
    return NODES_BY_TYPE.get(type);
  },
  nodeTypes(): string[] {
    return [...NODES_BY_TYPE.keys()];
  },
};
