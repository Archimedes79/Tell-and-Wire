import NodeDefinition from '../../authoring/NodeDefinition';
import type { NodePanelProps } from '../NodeGuiBuilder';

/**
 * An ai node: ✨ Generate, and what ✨ writes from its text -- input.js,
 * output.js and prompt.md, the instructions its model is given. Everything
 * that is a knob rather than a sentence is in `AiNodeAdvancedPanel`.
 */
export default function AiNodePanel(props: NodePanelProps) {
  return <NodeDefinition {...props} />;
}
