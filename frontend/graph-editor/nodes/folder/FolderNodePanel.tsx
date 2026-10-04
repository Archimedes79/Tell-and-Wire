import { useId } from 'react';
import PathField, { FileTypesField } from '../../../app/dialogs/PathField';
import { listAsRun } from '../../authoring/readAsRun';
import FolderListing from '../../../app/fields/FolderListing';
import { DIMMER, MUTED } from '../../../app/ui/theme';
import type { NodePanelProps } from '../NodeGuiBuilder';

/**
 * A folder node: the folder, its file types and whether it looks into
 * subfolders, then the list -- drawn by the same component a folder picker on
 * a page is.
 *
 * It reads no file, and it is no way into the graph: a folder somebody
 * chooses on the page, or a caller sends, arrives in a start point's package
 * and is wired into its "Path".
 */
export default function FolderNodePanel({ node, setConfig }: NodePanelProps) {
  const path = String(node.config.path ?? '');
  const folder = useId();
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: MUTED }} htmlFor={folder}>Folder</label>
        <PathField
          id={folder}
          value={path}
          onChange={(picked) => setConfig('path', picked)}
          mode="directory"
          extensions={node.config.extensions ?? ''}
          placeholder="/path/to/folder"
        />
        <p className="text-xs mt-1" style={{ color: DIMMER }}>
          A path wired into its “Path” port is listed instead.
        </p>
      </div>
      <FileTypesField value={node.config.extensions ?? ''} onChange={(extensions) => setConfig('extensions', extensions)} />
      {/* Its file types and its subfolders, then the list -- as a run lists
          it, the way the folder picker on a page does. */}
      <FolderListing
        recursive={!!node.config.recursive}
        onRecursive={(recursive) => setConfig('recursive', recursive)}
        noFolder={!path.trim()}
        list={() => listAsRun(node)}
        of={JSON.stringify([path, node.config.extensions ?? '', !!node.config.recursive])}
      />
    </div>
  );
}
