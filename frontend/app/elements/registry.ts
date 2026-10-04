// Every element's GuiBuilder, by the name the file format gives it: the mirror of
// `engine/src/elements/registry.ts`. The shells ask these and never switch on a
// node type or a widget kind themselves.

import type { NodeType } from '../graph';
import type { NodeGuiBuilder } from '../../graph-editor/nodes/NodeGuiBuilder';
import { StartNodeGuiBuilder } from '../../graph-editor/nodes/start/StartNodeGuiBuilder';
import { FolderNodeGuiBuilder } from '../../graph-editor/nodes/folder/FolderNodeGuiBuilder';
import { AiNodeGuiBuilder } from '../../graph-editor/nodes/ai/AiNodeGuiBuilder';
import { CodeNodeGuiBuilder } from '../../graph-editor/nodes/code/CodeNodeGuiBuilder';
import { DataNodeGuiBuilder } from '../../graph-editor/nodes/data/DataNodeGuiBuilder';
import { EndNodeGuiBuilder } from '../../graph-editor/nodes/end/EndNodeGuiBuilder';
import { SubgraphNodeGuiBuilder } from '../../graph-editor/nodes/subgraph/SubgraphNodeGuiBuilder';

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

export { WIDGET_BUILDERS } from '../../gui-editor/widgets/roster';
