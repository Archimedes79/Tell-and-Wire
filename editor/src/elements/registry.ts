// Every element's GuiBuilder, by the name the file format gives it: the mirror of
// `engine/src/elements/registry.ts`. The shells ask these and never switch on a
// node type or a widget kind themselves.

import type { NodeType } from '@/graph';
import type { NodeGuiBuilder } from './NodeGuiBuilder';
import { StartNodeGuiBuilder } from './nodes/start/StartNodeGuiBuilder';
import { FolderNodeGuiBuilder } from './nodes/folder/FolderNodeGuiBuilder';
import { AiNodeGuiBuilder } from './nodes/ai/AiNodeGuiBuilder';
import { CodeNodeGuiBuilder } from './nodes/code/CodeNodeGuiBuilder';
import { DataNodeGuiBuilder } from './nodes/data/DataNodeGuiBuilder';
import { EndNodeGuiBuilder } from './nodes/end/EndNodeGuiBuilder';
import { SubgraphNodeGuiBuilder } from './nodes/subgraph/SubgraphNodeGuiBuilder';

/** Every node type's GuiBuilder, by type, in the engine's order. */
export const NODE_BUILDERS: Record<NodeType, NodeGuiBuilder> = {
  start: new StartNodeGuiBuilder(),
  folder: new FolderNodeGuiBuilder(),
  ai: new AiNodeGuiBuilder(),
  code: new CodeNodeGuiBuilder(),
  data: new DataNodeGuiBuilder(),
  end: new EndNodeGuiBuilder(),
  subgraph: new SubgraphNodeGuiBuilder(),
};

export { WIDGET_BUILDERS } from './widgets/roster';
