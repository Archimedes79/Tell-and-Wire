import { useState } from 'react';
import { useGraphStore } from '../../app/store/graphStore';
import { call } from '../../app/api/client';
import { errorText } from '../../app/api/errorText';
import Button from '../../app/ui/Button';
import { DIMMER, MUTED } from '../../app/ui/theme';

/** Written when the tool is saved to a folder: before that a node's files are in the graph, not on disk. */
const NOT_ON_DISK = 'Written when the tool is saved to a folder.';

/**
 * Open *file* of node *nodeId* in the person's own editor. The tool is saved
 * first, so the file holds what the panel shows, and what is saved there
 * comes back by itself (the editor watches the tool's folder). *before* runs
 * once the click is taken and before the save: what the panel still holds is
 * written into the graph first.
 */
function useOpenInEditor(nodeId: string, file: string, before?: () => void) {
  const isProject = useGraphStore((s) => s.isProject);
  const [status, setStatus] = useState('');
  const open = async () => {
    const { currentFilePath: graphPath, subgraphStack } = useGraphStore.getState();
    if (!graphPath) return;
    try {
      setStatus('Saving, then opening…');
      before?.();
      await useGraphStore.getState().save();
      // The node is in the graph open now, which may be one a node holds: its
      // id is that graph's own, and alone it named the outer node of that id.
      const inside = subgraphStack.map((frame) => frame.nodeId);
      const opened = await call('openExternal', { graph_path: graphPath, inside, node_id: nodeId, file });
      setStatus(`Opened in ${opened.with}.`);
    } catch (error) {
      setStatus(errorText(error, `Could not open ${file}.`));
    }
  };
  return { isProject, status, open };
}

/** "Open in my editor": in the header of the large window a file's chip opens. */
export function OpenInEditor({ nodeId, file, before }: { nodeId: string; file: string; before?: () => void }) {
  const { isProject, status, open } = useOpenInEditor(nodeId, file, before);
  return (
    <span className="inline-flex items-center gap-2">
      <Button size="sm" onClick={open} disabled={!isProject}
        title={isProject ? `Open ${file} in your own editor (the tool is saved first)` : NOT_ON_DISK}>
        Open in my editor ↗
      </Button>
      {status && <span className="text-xs" style={{ color: MUTED }}>{status}</span>}
    </span>
  );
}

/**
 * A file of a node the node view has no editor of its own for -- `history.md`
 * -- as a chip that opens it in the person's own editor (↗). Shown whether or
 * not the node holds anything there yet: the folder has every file from the
 * start, a stub until ✨ writes it (*written* false says so). Greyed in a tool
 * not saved to a folder, which has no file to open.
 */
export default function FileChip({ nodeId, file, written, before }: {
  nodeId: string;
  file: string;
  /** The node holds something there; otherwise the file is its stub. */
  written: boolean;
  before?: () => void;
}) {
  const { isProject, status, open } = useOpenInEditor(nodeId, file, before);
  const title = !isProject ? NOT_ON_DISK
    : `Open ${file} in your own editor (the tool is saved first)${written ? '' : ' -- not written yet: it holds its stub'}`;
  return (
    <span className="inline-flex items-center gap-1.5">
      <Button size="sm" className="font-mono" onClick={open} disabled={!isProject} title={title} aria-label={`Open ${file}`}>
        {file} ↗
      </Button>
      {/* Unsaved, every chip would say the same: the node view says it once (`NodeView`). */}
      {!written && isProject && <span className="text-xs" style={{ color: DIMMER }}>not written yet</span>}
      {status && <span className="text-xs" style={{ color: MUTED }}>{status}</span>}
    </span>
  );
}
