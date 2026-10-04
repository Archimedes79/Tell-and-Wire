import { useId } from 'react';
import PathField from '../../../app/dialogs/PathField';
import { useGraphStore } from '../../../app/store/graphStore';
import { blocksAt } from '../../../app/document/page';
import { DIMMER, FIELD, MUTED } from '../../../app/ui/theme';
import { EndNodeRunner } from '../../../../graph/nodes/end/EndNodeRunner.ts';
import { resultKeys } from '../../../../graph/nodes/NodeRunner.ts';
import { registry as runnerRegistry } from '../../../../graph/nodes/registry.ts';
import type { NodePanelProps } from '../NodeGuiBuilder';

const END = new EndNodeRunner();

/**
 * An end point: what a run hands back under the node's name -- always --
 * and, besides, a file or a folder it is written to.
 *
 * The run's result is no place a value is sent to, beside a file: it is what
 * the end point is. A page block shows it by name, a script and the command
 * line read it by name, and the page is never chosen here -- it chooses the
 * end point (`shows`). Writing a file is the end point's own, done whether or
 * not anyone watches. What it is -- its text -- and where it is written are
 * what the node feeding it is told it wants (`EndNodeGuiBuilder.wantsOn`).
 */
export default function EndNodePanel({ node, setConfig }: NodePanelProps) {
  const mode = node.config.write_mode;
  const writes = mode === 'file' || mode === 'directory';
  const alsoWrite = useId();
  const path = useId();
  // The key its value really gets in the run's result: its name, unless an
  // end point before it has that already (`resultKeys`, as a run asks).
  const nodes = useGraphStore((s) => s.rfNodes);
  const page = useGraphStore((s) => s.page);
  const label = END.resultLabel(node as never);
  const key = resultKeys(nodes.map((n) => (n.id === node.id ? node : n.data.graphNode)) as never, runnerRegistry).get(node.id) ?? label;
  const shownBy = blocksAt(page, node.id).show.map((block) => `“${block.label || block.id}”`);

  return (
    <div className="space-y-4">
      <p className="text-xs" style={{ color: DIMMER }}>
        {key === label
          ? `Handed back as “${key}”: a page block, a script or the command line reads it by that name.`
          : `Handed back as “${key}”: “${label}” is another end point's already. Give it a name of its own.`}
        {shownBy.length ? ` On the page, ${shownBy.join(', ')} show${shownBy.length === 1 ? 's' : ''} it.` : ''}
      </p>

      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: MUTED }} htmlFor={alsoWrite}>Also write it to</label>
        <select
          id={alsoWrite}
          className="w-full rounded-lg px-3 py-2 text-sm"
          style={FIELD}
          value={writes ? mode : 'none'}
          onChange={(e) => setConfig('write_mode', e.target.value)}
        >
          <option value="none">Nothing</option>
          <option value="file">A file</option>
          <option value="directory">A folder — one file per value</option>
        </select>

        {writes && (
          <div className="mt-3">
            <label className="block text-xs font-medium mb-1" style={{ color: MUTED }} htmlFor={path}>
              {mode === 'file' ? 'File' : 'Folder'}
            </label>
            {/* A file is saved, so 📂 Browse… starts with its name filled in; a folder is chosen as it is. */}
            <PathField
              id={path}
              mode={mode === 'file' ? 'save' : 'directory'}
              value={String(node.config.path ?? '')}
              onChange={(picked) => setConfig('path', picked)}
              placeholder={mode === 'file' ? 'output/result.txt' : 'output/results'}
            />
            <p className="text-xs mt-1" style={{ color: DIMMER }}
              title={`${mode === 'file' ? 'A text is written as it is, anything else as JSON.' : 'Each value that arrives becomes a file of its own in this folder.'} Written every run, page or no page. A path wired into the “Path” port is used instead: one chosen on the page, or sent by a call.`}>
              Written every run. A path wired into “Path” is used instead.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
