import PathField, { FileTypesField } from '@/dialogs/PathField';
import { listAsRun } from '@/authoring/readAsRun';
import FolderListing from '../../fields/FolderListing';
import { DIMMER, MUTED } from '@/ui/theme';
import type { NodePanelProps } from '../../NodeGuiBuilder';

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
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: MUTED }}>Folder</label>
        <PathField
          value={path}
          onChange={(picked) => setConfig('path', picked)}
          mode="directory"
          extensions={node.config.extensions ?? ''}
          placeholder="/path/to/folder"
          ariaLabel="Folder"
        />
        <p className="text-xs mt-1" style={{ color: DIMMER }}>
          A path wired into its “Path” port is listed instead: a folder chosen on the page, or sent by a call.
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
      <div>
        <label className="flex items-center gap-2 text-sm" style={{ color: MUTED }}>
          <input
            type="checkbox"
            checked={!!node.config.catch_errors}
            onChange={(e) => setConfig('catch_errors', e.target.checked)}
          />
          Catch a failed listing instead of failing the node
        </label>
        <p className="text-xs mt-1" style={{ color: DIMMER }}>
          A folder that is not there fails this node. Turned on, it adds an{' '}
          <strong style={{ color: '#a78bfa' }}>error</strong> output port: empty on success, the reason otherwise.
        </p>
      </div>
    </div>
  );
}
