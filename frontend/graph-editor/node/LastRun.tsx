import { useGraphStore } from '../../app/store/graphStore';
import { hasOutputs, statusTone } from '../../app/store/executionStatus';
import { DANGER_FILL, DANGER_TEXT, DIM, LINE, MUTED, SUNKEN, WARNING_FILL, WARNING_TEXT } from '../../app/ui/theme';

/** A value as the run kept it, for reading. */
const shown = (value: unknown): string => JSON.stringify(value, null, 2) ?? '';

/**
 * What the last run said of this node: how it went, why it failed or what it
 * wants said, what arrived on its inputs and what it made. Folded under the
 * pane, and only once a run has happened: the cards show a line of it, this is
 * the whole of it.
 */
export default function LastRun({ nodeId }: { nodeId: string }) {
  const result = useGraphStore((s) => s.executionResult?.node_results.find((one) => one.node_id === nodeId));
  if (!result) return null;
  const tone = statusTone(result.status);
  const messages = result.messages ?? [];
  const inputs = Object.keys(result.inputs ?? {}).length > 0;
  const outputs = hasOutputs(result) && Object.keys(result.outputs).length > 0;
  return (
    <details className="rounded-lg" style={{ border: `1px solid ${LINE}` }}>
      <summary className="px-3 py-2 text-xs font-medium cursor-pointer select-none flex items-center gap-2" style={{ color: MUTED }}>
        Last run
        <span className="px-1.5 py-0.5 rounded" style={{ background: tone.bg, color: tone.fg }}>{result.status}</span>
      </summary>
      <div className="px-3 pb-3 space-y-2 text-xs">
        {result.error && (
          <div className="p-2 rounded" style={result.status === 'partial' ? { color: WARNING_TEXT, background: WARNING_FILL } : { color: DANGER_TEXT, background: DANGER_FILL }}>
            {result.error}
          </div>
        )}
        {/* What the run has to say about a node that did not fail: why it had
            nothing to do, or that its outputs broke its output interface. */}
        {messages.length > 0 && (
          <div className="p-2 rounded space-y-1" style={{ color: WARNING_TEXT, background: WARNING_FILL }}>
            {messages.map((line, index) => <div key={index}>⚠ {line}</div>)}
          </div>
        )}
        {inputs && (
          <div>
            <div className="font-medium mb-1" style={{ color: DIM }}>Arrived</div>
            <pre className="p-2 rounded overflow-auto" style={{ background: SUNKEN, color: MUTED, maxHeight: 160 }}>{shown(result.inputs)}</pre>
          </div>
        )}
        {outputs && (
          <div>
            <div className="font-medium mb-1" style={{ color: DIM }}>Made</div>
            <pre className="p-2 rounded overflow-auto" style={{ background: SUNKEN, color: MUTED, maxHeight: 160 }}>{shown(result.outputs)}</pre>
          </div>
        )}
      </div>
    </details>
  );
}
