// The debug window: every round the notebook ran, node by node -- what each got, what it made, why one did nothing.

import { forgetRuns, stopRuns } from '../notebook/document/runs';
import { useNotebook, type Outcome } from '../notebook/document/store';

const WORDS: Record<Outcome, string> = { done: 'Done', empty: 'Nothing to do', failed: 'Failed', stopped: 'Stopped' };

/** A value for a line of a table: short, as text. */
function brief(value: unknown): string {
  if (value === undefined || value === null) return '';
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 1);
  return text.length > 1200 ? `${text.slice(0, 1200)} …` : text;
}

export default function Debug() {
  const log = useNotebook((s) => s.log);
  const going = useNotebook((s) => s.going);
  const epoch = useNotebook((s) => s.epoch);
  return (
    <div className="nb-wide">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className="nb-note" style={{ flex: 1 }}>
          {log.length ? `${log.length} round${log.length === 1 ? '' : 's'} this session, the last one first.` : 'Nothing has run yet. Run a window and its rounds are listed here.'} Session {epoch}.
        </span>
        {going.length > 0 && <button className="nb-btn" onClick={() => { void stopRuns(); }}>■ Stop</button>}
        <button className="nb-btn" disabled={going.length > 0} onClick={() => { void forgetRuns(); }} title="Forget what the windows made and what using them left with the host">Forget results</button>
      </div>
      {log.map((entry) => {
        const nodes = entry.round.result?.node_results ?? [];
        return (
          <details key={entry.id} className="nb-run-log" open={entry === log[0]}>
            <summary>
              <span className={`nb-chip ${entry.outcome === 'done' ? 'done' : entry.outcome === 'failed' ? 'failed' : 'empty'}`}>{WORDS[entry.outcome]}</span>
              <strong>{entry.title}</strong>
              <span className="nb-note">{new Date(entry.at).toLocaleTimeString()} · {nodes.length} nodes · {entry.round.completed}/{entry.round.total} ran</span>
            </summary>
            {entry.round.error && <div className="nb-out msg failed" style={{ margin: '0 14px 10px' }}>{entry.round.error}</div>}
            <table>
              <thead><tr><th>Node</th><th>Status</th><th>Got</th><th>Made</th></tr></thead>
              <tbody>
                {nodes.map((node) => (
                  <tr key={node.node_id}>
                    <td className="nb-mono">{node.node_id}</td>
                    <td>
                      {node.status}{node.held ? ' (stood still)' : ''}{node.reused ? ' (reused)' : ''}
                      {(node.error || node.messages?.[0]) && <div style={{ color: node.error ? 'var(--red)' : 'var(--amber)' }}>{node.error || node.messages?.[0]}</div>}
                    </td>
                    <td><pre>{brief(node.inputs)}</pre></td>
                    <td><pre>{brief(node.outputs)}</pre></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        );
      })}
    </div>
  );
}
