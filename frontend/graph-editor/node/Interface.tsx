import type { GraphNode } from '../../app/graph';
import { ArrowRight } from 'lucide-react';
import { DIMMER, LINE, MUTED, RAISE, WARNING_FILL, WARNING_TEXT } from '../../app/ui/theme';
import { fileOf, portIdsOf, strayDefinition } from '../authoring/generation';
import { Chip } from '../views/RowList';

type Side = 'input' | 'output';

/**
 * What the node takes in and hands on, as one line above whatever is open --
 * `file · path → text · info` -- from its ports: the names the code reads and
 * returns, in view while it is written. A side is a button to its file; where
 * that file names others than the node has, it says so (`≠ input.js`).
 */
export default function Interface({ node, files, onOpen }: { node: GraphNode; files: Side[]; onOpen: (side: Side) => void }) {
  const side = (which: Side) => {
    const names = portIdsOf(node, which);
    const { file } = fileOf(node, which);
    const stray = strayDefinition(node, which);
    return (
      <span className="inline-flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          onClick={() => onOpen(which)}
          disabled={!files.includes(which)}
          title={`${file}: open it`}
          className="inline-flex items-center gap-1.5 rounded-md hover-raise px-1 py-0.5"
        >
          {names.length ? names.map((name) => <Chip key={name} name={name} kind={which} />) : <span className="text-xs" style={{ color: DIMMER }}>{which === 'input' ? 'nothing in' : 'nothing out'}</span>}
        </button>
        {stray && (
          <span
            className="text-xs rounded-md px-1.5 font-mono"
            style={{ background: WARNING_FILL, color: WARNING_TEXT }}
            title={`${file} names other ${which}s than the node has: the node's are the ones above`}
          >
            ≠ {file}
          </span>
        )}
      </span>
    );
  };

  return (
    <div className="flex items-center gap-2 flex-wrap rounded-lg px-2 py-1.5 text-sm" style={{ background: RAISE, border: `1px solid ${LINE}`, color: MUTED }} aria-label="What goes in and what comes out">
      {side('input')}
      <ArrowRight size={14} strokeWidth={2} aria-hidden="true" style={{ color: DIMMER }} />
      {side('output')}
    </div>
  );
}
