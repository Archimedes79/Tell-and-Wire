import { CatchFailures } from '../../fields/RunOptions';
import type { NodeAdvancedPanelProps } from '../NodeGuiBuilder';

/** A folder that is not there fails the node: this is the one setting its Advanced section holds. */
export default function FolderNodeAdvancedPanel({ node, setConfig }: NodeAdvancedPanelProps) {
  return <CatchFailures node={node} setConfig={setConfig} subject="the listing" />;
}
