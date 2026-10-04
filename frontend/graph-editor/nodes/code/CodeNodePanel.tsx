import NodeDefinition from '../../authoring/NodeDefinition';
import type { NodePanelProps } from '../NodeGuiBuilder';

/** A code node: ✨ Generate, and what ✨ writes from its text -- input.js, output.js, code.js. */
export default function CodeNodePanel(props: NodePanelProps) {
  return <NodeDefinition {...props} />;
}
