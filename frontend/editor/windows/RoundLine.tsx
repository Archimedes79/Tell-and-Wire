import { roundGoing, useSession } from '../../deployment/gui/kit/api/session';
import { roundError } from '../../deployment/gui/surface/guiInUse';
import Button from '../../deployment/gui/kit/ui/Button';
import { DANGER_FILL, DANGER_TEXT, LINE, MUTED, SURFACE, WARNING_FILL, WARNING_TEXT } from '../../deployment/gui/kit/ui/theme';
import { roundExplained } from '../gui/roundWords';
import type { Windows } from '../../../gui/editor/windows/windows.ts';
import { useNotebook } from './notebookStore';

/** The window a node of the graph belongs to: the start point has the window's id, every other node starts with it. */
const windowOf = (doc: Windows, nodeId: string) => doc.windows.find((one) => nodeId === one.id || nodeId.startsWith(`${one.id}_`));

/**
 * How the last run went, in a line under the bar -- and, where it gave out, where and why, with the way to the
 * window. A window that had nothing to do (an input left empty) says so here, since its page looks as it did.
 */
export default function RoundLine({ doc }: { doc: Windows }) {
  const round = useSession((s) => s.round);
  const going = useSession(roundGoing);
  const select = useNotebook((s) => s.select);
  const graph = useNotebook((s) => s.graph);
  if (!round) return null;

  const nameOf = (id: string): string => {
    const window = windowOf(doc, id);
    const label = graph?.nodes.find((node) => node.id === id)?.label;
    return window && id === window.id ? window.title : label ? `${label}` : id;
  };
  const explained = roundExplained(round, nameOf);
  const failed = roundError(round);
  const stopped = explained?.stopped;
  const where = stopped ? windowOf(doc, stopped.node) : undefined;
  const bad = !!failed || round.result?.status === 'error' || round.result?.node_results.find((one) => one.node_id === stopped?.node)?.status === 'error';

  let text = going ? '⏳ Running…' : '';
  if (!going) {
    if (failed) text = `❌ ${failed}`;
    else if (round.cancelled) text = 'Stopped.';
    else if (stopped) text = `${bad ? '❌' : '⚠'} “${nameOf(stopped.node)}”${where && stopped.node !== where.id ? ` in “${where.title}”` : ''}: ${stopped.why}`;
    else if (explained) text = `✅ ${explained.line}`;
  }
  if (!text) return null;

  const look = bad || failed ? { background: DANGER_FILL, color: DANGER_TEXT } : stopped ? { background: WARNING_FILL, color: WARNING_TEXT } : { background: SURFACE, color: MUTED };
  return (
    <div role="status" className="px-4 py-1.5 text-xs flex items-center gap-3 shrink-0" style={{ ...look, borderBottom: `1px solid ${LINE}` }}>
      <span className="flex-1 min-w-0 truncate" title={explained?.why.join('\n') || text}>{text}</span>
      {where && !going && <Button size="sm" onClick={() => select(where.id)}>Show the window</Button>}
    </div>
  );
}
