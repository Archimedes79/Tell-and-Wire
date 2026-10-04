import RunOptions from '../../fields/RunOptions';
import RunOncePerItem from '../../fields/RunOncePerItem';
import type { NodeAdvancedPanelProps } from '../NodeGuiBuilder';

/** The switches with good defaults, after its ports: see `AdvancedPanel`. */
export default function CodeNodeAdvancedPanel({ node, setConfig, updateNode }: NodeAdvancedPanelProps) {
  return (
    <>
      <RunOncePerItem node={node} updateNode={updateNode} subject="this code" />
      <RunOptions node={node} setConfig={setConfig} subject="this code" />
    </>
  );
}
