import { useState } from 'react';
import Modal from '../../deployment/gui/kit/ui/Modal';
import Button from '../../deployment/gui/kit/ui/Button';
import { useGraphStore } from '../document/store/graphStore';
import { nowText, useProviderStatus } from './fields/ProviderModelSelect';
import { reportText, runReport, type ReportStatus } from './runReport';
import {
  DANGER, DANGER_FILL, DANGER_TEXT, DIM, DIMMER, LINE, MUTED, SUCCESS, SUCCESS_FILL, SUNKEN, TEXT, WARNING,
} from '../../deployment/gui/kit/ui/theme';

const LOOK: Record<ReportStatus, { color: string; glyph: string; word: string }> = {
  success: { color: SUCCESS, glyph: '✓', word: 'Done' },
  partial: { color: WARNING, glyph: '◐', word: 'Partly' },
  error: { color: DANGER, glyph: '!', word: 'Failed' },
  skipped: { color: DIM, glyph: '–', word: 'Did not run' },
  held: { color: DIM, glyph: '‖', word: 'Stood still' },
};

/** The text on the clipboard: by the browser's way, and by a field selected where it refuses (an older app view, a page without a secure address). */
async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement('textarea');
    field.value = text;
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand('copy');
    field.remove();
    return ok;
  }
}

/**
 * What happened in the last run, node by node, in words anyone can read, with the error of each
 * node that failed as it was given -- and a button that copies all of it as text, to send to
 * whoever can help. What went in and out of the nodes is the person's own data: it is in the
 * copy only if they say so.
 */
export default function RunReportDialog({ onClose, onShowNode }: { onClose: () => void; onShowNode: (nodeId: string) => void }) {
  const result = useGraphStore((s) => s.executionResult);
  const nodes = useGraphStore.getState().rfNodes.map((item) => item.data.graphNode);
  const toolName = useGraphStore((s) => s.metadata.name);
  const probe = useProviderStatus();
  const [withData, setWithData] = useState(false);
  const [copied, setCopied] = useState<'' | 'yes' | 'no'>('');
  const report = result ? runReport(result, nodes) : null;

  const text = report ? reportText(report, { tool: toolName, ai: nowText(probe, 'run'), withData }) : '';
  const tone = !report ? undefined
    : report.status === 'success' ? { bg: SUCCESS_FILL, ink: SUCCESS }
      : report.status === 'cancelled' ? { bg: SUNKEN, ink: MUTED }
        : { bg: DANGER_FILL, ink: DANGER_TEXT };

  return (
    <Modal
      title="Run report"
      onClose={onClose}
      maxWidth="max-w-3xl"
      footer={
        report && (
          <>
            <label className="mr-auto flex items-center gap-2 text-xs" style={{ color: MUTED }}>
              <input type="checkbox" checked={withData} onChange={(event) => setWithData(event.target.checked)} />
              Include what went in and out of the nodes
            </label>
            <Button onClick={onClose}>Close</Button>
            <Button
              variant="primary"
              onClick={() => { void copy(text).then((ok) => { setCopied(ok ? 'yes' : 'no'); setTimeout(() => setCopied(''), 2500); }); }}
            >
              {copied === 'yes' ? 'Copied ✓' : copied === 'no' ? 'Could not copy' : 'Copy report'}
            </Button>
          </>
        )
      }
    >
      <div className="p-5 flex flex-col gap-4" style={{ color: TEXT }}>
        {!report && <p className="text-sm" style={{ color: MUTED }}>Nothing has run yet. Press ▶ Run, and what happens is told here.</p>}
        {report && tone && (
          <>
            <div className="rounded-lg px-4 py-3 text-sm" style={{ background: tone.bg, border: `1px solid ${LINE}`, borderLeft: `3px solid ${tone.ink}` }} role="status">
              {report.summary}
            </div>

            {report.failed && (
              <section className="rounded-lg p-4 flex flex-col gap-2" style={{ background: SUNKEN, border: `1px solid ${DANGER}` }}>
                <div className="flex items-center gap-3">
                  <h3 className="flex-1 min-w-0 text-sm font-semibold truncate">Where to look first: {report.failed.label}</h3>
                  <Button size="sm" onClick={() => { onClose(); onShowNode(report.failed!.id); }}>Open it</Button>
                </div>
                <p className="text-sm" style={{ color: MUTED }}>{report.failed.plain}</p>
                {report.failed.error && (
                  <pre className="text-xs whitespace-pre-wrap break-words rounded p-2 max-h-48 overflow-auto" style={{ background: DANGER_FILL, color: DANGER_TEXT }}>
                    {report.failed.error}
                  </pre>
                )}
              </section>
            )}

            <section>
              <h3 className="text-sm font-semibold mb-2">Every node, in the order it ran</h3>
              <ol className="flex flex-col">
                {report.nodes.map((node) => {
                  const look = LOOK[node.status];
                  return (
                    <li key={node.id} className="flex items-start gap-3 py-2" style={{ borderTop: `1px solid ${LINE}` }}>
                      <span
                        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold leading-none"
                        style={{ background: look.color, color: SUNKEN }}
                        role="img"
                        aria-label={look.word}
                      >
                        {look.glyph}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm"><span className="font-medium">{node.label}</span> <span className="text-xs" style={{ color: DIMMER }}>{look.word}</span></div>
                        {node.plain && node.status !== 'success' && <div className="text-xs" style={{ color: MUTED }}>{node.plain}</div>}
                        {withData && (node.inputs || node.outputs) && (
                          <pre className="mt-1 text-xs whitespace-pre-wrap break-words" style={{ color: DIM }}>
                            {[node.inputs && `in\n${node.inputs}`, node.outputs && `out\n${node.outputs}`].filter(Boolean).join('\n')}
                          </pre>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          </>
        )}
      </div>
    </Modal>
  );
}
