import { CatchFailures } from '../../fields/RunOptions';
import type { NodePanelProps } from '../NodeGuiBuilder';

/** A folder that is not there fails the node: this is the one setting its Advanced section holds. */
export default function FolderNodeAdvancedPanel({ node, setConfig }: NodePanelProps) {
  return <CatchFailures node={node} setConfig={setConfig} subject="the listing" />;
}
