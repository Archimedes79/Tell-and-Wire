import { useId, useMemo, useState } from 'react';
import type { Graph } from './graph';
import Modal from './ui/Modal';
import Button from './ui/Button';
import GraphProblems from './GraphProblems';
import { DANGER_TEXT, LINE, MUTED, SUNKEN, TEXT } from './ui/theme';

/** *raw* as a graph: JSON with nodes and edges. Otherwise it says what is wrong. */
export function parseGraphJson(raw: string): Graph {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid graph JSON: ${error instanceof Error ? error.message : 'Malformed JSON.'}`);
  }
  const graph = parsed as Partial<Graph> | null;
  if (!graph || typeof graph !== 'object' || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    throw new Error('Invalid graph JSON: expected nodes and edges arrays.');
  }
  return graph as Graph;
}

/**
 * The graph as JSON, to copy -- or to paste another over, and load. What
 * `check` finds in what is in the box is said under it, before it is loaded.
 *
 * Pasted JSON is typed work: a stray click on the backdrop must not lose it.
 */
export default function JsonDialog({ graph, onLoad, onClose }: {
  graph: Graph;
  /** Make it the document, after asking about unsaved work; whether it was. */
  onLoad: (graph: Graph) => Promise<boolean>;
  onClose: () => void;
}) {
  const [value, setValue] = useState(() => JSON.stringify(graph, null, 2));
  const [problem, setProblem] = useState('');
  const [copied, setCopied] = useState('');
  const id = useId();

  const pasted = useMemo(() => {
    try {
      return parseGraphJson(value);
    } catch {
      return null;
    }
  }, [value]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied('✅ Copied to clipboard');
    } catch {
      setCopied('❌ Could not access the clipboard');
    }
  };

  const load = async () => {
    let graph: Graph;
    try {
      graph = parseGraphJson(value);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Invalid graph JSON.');
      return;
    }
    if (await onLoad(graph)) onClose();
  };

  return (
    <Modal
      title="Copy or paste the graph as JSON"
      onClose={onClose}
      maxWidth="max-w-3xl"
      dismissOnBackdrop={false}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button onClick={copy}>📋 Copy</Button>
          <Button variant="primary" onClick={() => { void load(); }}>Load graph</Button>
        </>
      }
    >
      <div className="p-5 flex flex-col gap-3">
        <label htmlFor={id} className="sr-only">Graph JSON</label>
        <textarea
          id={id}
          value={value}
          onChange={(e) => { setValue(e.target.value); setProblem(''); setCopied(''); }}
          className="w-full rounded-lg p-4 text-sm font-mono resize-y outline-none"
          style={{ minHeight: 320, background: SUNKEN, border: `1px solid ${LINE}`, color: TEXT }}
          spellCheck={false}
        />
        {problem && <div className="text-xs" style={{ color: DANGER_TEXT }}>{problem}</div>}
        {pasted && <GraphProblems graph={pasted} />}
        {copied && <div className="text-xs" style={{ color: MUTED }}>{copied}</div>}
      </div>
    </Modal>
  );
}
