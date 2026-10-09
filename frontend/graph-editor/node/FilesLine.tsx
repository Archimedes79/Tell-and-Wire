import { useState, type DragEvent } from 'react';
import { errorText } from '../../app/api/errorText';
import type { GraphNode } from '../../app/graph';
import FileBrowserDialog from '../../app/dialogs/FileBrowserDialog';
import { filesOf } from '../../app/document/givenFiles';
import Button from '../../app/ui/Button';
import { ONCE, type NodePanelProps } from '../nodes/NodeGuiBuilder';
import { carriesFiles, droppedFile, droppedPath } from '../authoring/droppedFile';
import { fileValue } from '../authoring/readAsRun';
import { DIMMER, FIELD, MUTED, TEXT } from '../../app/ui/theme';

/**
 * The files a definition is written from -- examples, a spec -- folded away
 * under their file, a chip each, ✕ to let one go. "Add a file" adds one, and
 * so does a file dropped here or on the node's card. Where a node has its
 * input wired, Pull needs none of them: they are for a node nothing feeds,
 * and for a spec the Output chat is written from.
 */
export default function FilesLine({ node, side, setConfig }: {
  node: GraphNode; side: 'input' | 'output'; setConfig: NodePanelProps['setConfig'];
}) {
  const key = side === 'input' ? 'input_files' : 'output_files';
  const files = filesOf(node, side);
  const [note, setNote] = useState('');
  const [browsing, setBrowsing] = useState(false);
  /** The files as the node holds them when a change lands. */
  const held = (current: unknown): string[] => (Array.isArray(current) ? current.filter((item): item is string => typeof item === 'string') : []);
  /** One more: a file given twice is still one. */
  const add = (path: string) => setConfig(key, (current: unknown) => (held(current).includes(path) ? held(current) : [...held(current), path]), ONCE);
  const letGo = (path: string) => setConfig(key, (current: unknown) => {
    const left = held(current).filter((item) => item !== path);
    return left.length ? left : undefined;
  }, ONCE);
  const take = async (found: () => Promise<string>) => {
    try {
      add(String(await fileValue(true, found, async () => '')));
      setNote('');
    } catch (error) {
      setNote(errorText(error, 'The file could not be taken.'));
    }
  };
  const onDragOver = (event: DragEvent) => {
    if (!carriesFiles(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };
  const onDrop = (event: DragEvent) => {
    const file = droppedFile(event.dataTransfer);
    if (!file) return;
    event.preventDefault();
    event.stopPropagation();
    void take(() => droppedPath(file));
  };
  const which = side === 'input' ? 'the input' : 'the output';
  return (
    <>
      {/* Open where there are files, and where a drop was refused: its reason is inside. */}
      <details className="text-xs" open={files.length > 0 || !!note} onDragOver={onDragOver} onDrop={onDrop} aria-label={`Files ${which} is written from`}>
        <summary className="cursor-pointer select-none" style={{ color: MUTED }}>
          {side === 'input' ? 'Example files' : 'Output files'}{files.length ? ` (${files.length})` : ''}
          <span style={{ color: DIMMER }}> -- files {which} is written from, where nothing feeds it</span>
        </summary>
        <div className="mt-2 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            {files.map((path) => (
              <span key={path} className="inline-flex items-center gap-1 pl-1.5 rounded" style={FIELD}>
                <code style={{ color: TEXT }}>{path}</code>
                <Button variant="quiet" size="sm" onClick={() => letGo(path)} aria-label={`Let ${path} go`}
                  title={`${which} is no longer written from ${path}`}>
                  ✕
                </Button>
              </span>
            ))}
            {!files.length && <span style={{ color: DIMMER }}>none</span>}
            <Button size="sm" onClick={() => setBrowsing(true)}
              title={`Add a file ${which} is written from: ${side === 'input' ? 'an example of what arrives, or a spec' : 'a spec of what should go out, or an example'}`}>
              Add a file…
            </Button>
            <span style={{ color: DIMMER }}>-- or drop one here</span>
          </div>
          {note && <p style={{ color: MUTED }}>{note}</p>}
        </div>
      </details>
      {browsing && (
        <FileBrowserDialog
          mode="file"
          initialPath={files[files.length - 1]}
          onPick={(picked) => { setBrowsing(false); void take(async () => picked); }}
          onClose={() => setBrowsing(false)}
        />
      )}
    </>
  );
}
