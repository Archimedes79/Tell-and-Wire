import { useEffect, useState, type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { useGraphStore } from './store/graphStore';
import Button from './ui/Button';
import LiveGeneration from '../graph-editor/authoring/LiveGeneration';
import { hasDefinitions } from '../graph-editor/authoring/generation';
import GraphProblems from './GraphProblems';
import ProblemsChip from './ProblemsChip';
import { useGraphAsk, type GraphAsk } from './graphAsk';
import { changeGoesTo, changeTarget, describeChange, graphChange, graphRequest, targetName } from './graphChange';
import { ACCENT_TEXT, DANGER_TEXT, DIM, LINE, MUTED, SUNKEN, SURFACE, TEXT } from './ui/theme';

/**
 * The bar under the canvas, always there: say what to change, on the node the
 * person is on -- or, with none, on the whole graph.
 *
 * On a node whose body ✨ writes, the words go to the node's panel
 * (`askChange`), which changes the body as said. On the whole graph -- and on
 * a node whose settings are all it is, a change of that node in it -- ✨ Describe
 * a graph is sent the graph and the words, and what comes back is shown, with
 * what it adds, removes and changes and what `check` finds in it, before it is
 * applied as one undo step.
 */
export default function ChangeBar() {
  const target = useGraphStore((s) => changeTarget(s.rfNodes.map((n) => n.data.graphNode), s.editingNodeId));
  const clearSelection = useGraphStore((s) => s.clearSelection);
  const lastStep = useGraphStore((s) => s.past[s.past.length - 1]);
  const [text, setText] = useState('');
  // One request at a time, and only the last is still wanted: Stop leaves the one on its way unwanted.
  const { ask: change, send, reset } = useGraphAsk();
  /**
   * The undo step a change was applied as, while that is still the last one:
   * then Undo is the change. Not how many steps there were: the history is
   * kept to fifty, and once full the next edit left the count as it was, and
   * the note offered to undo that edit as the change.
   */
  const [applied, setApplied] = useState<string | null>(null);
  // Another graph opened, or a level in or out of this one: a change asked of
  // the graph before -- on its way, or back and not applied -- is not this
  // one's, and nor are the words said of it, waiting in the field.
  const opened = useGraphStore((s) => s.document);
  useEffect(() => {
    reset();
    setApplied(null);
    setText('');
  }, [opened, reset]);

  const asking = change.phase === 'asking';

  const submit = async () => {
    const words = text.trim();
    if (!words || asking) return;
    const store = useGraphStore.getState();
    if (target && changeGoesTo(target) === 'panel') {
      store.askChange(target.id, words);
      setText('');
      reset();
      return;
    }
    setText('');
    setApplied(null);
    // The words go back where they were, to be sent again or said otherwise.
    if (await send(words, graphRequest(target, words), store.exportGraph()) === 'failed') setText(words);
  };

  const stop = () => {
    if (change.phase !== 'asking') return;
    setText(change.said);
    reset();
  };

  const apply = () => {
    if (change.phase !== 'ready') return;
    useGraphStore.getState().changeGraph(change.graph);
    const { past } = useGraphStore.getState();
    setApplied(past[past.length - 1]);
    reset();
  };

  const discard = () => {
    if (change.phase === 'ready') setText(change.said);
    reset();
  };

  return (
    <div className="flex flex-col gap-2.5 px-4 pt-3 pb-3.5 shrink-0" style={{ background: SURFACE, borderTop: `1px solid ${LINE}` }}>
      {change.phase === 'asking' && (
        <Note>
          <div className="flex items-center gap-3">
            <span className="flex-1 min-w-0 truncate" style={{ color: TEXT }} title={change.said}>✨ Changing the graph as said: {change.said}</span>
            <Button size="sm" className="shrink-0" onClick={stop} title="The server may go on with it; what comes back is dropped">Stop waiting</Button>
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer select-none text-xs" style={{ color: MUTED }}>What is sent, and what comes back</summary>
            <div className="mt-2"><LiveGeneration calls={change.calls} minHeight={90} /></div>
          </details>
        </Note>
      )}
      {change.phase === 'ready' && <Proposal change={change} onApply={apply} onDiscard={discard} />}
      {change.phase === 'failed' && (
        <Note>
          <div className="flex items-start gap-3">
            <span className="flex-1 min-w-0" style={{ color: DANGER_TEXT }}>❌ {change.error}</span>
            <Button variant="quiet" size="sm" className="shrink-0" onClick={reset} aria-label="Dismiss" title="Dismiss">✕</Button>
          </div>
          {change.calls.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer select-none text-xs" style={{ color: MUTED }}>What was sent, and what came back</summary>
              <div className="mt-2"><LiveGeneration calls={change.calls} minHeight={90} /></div>
            </details>
          )}
        </Note>
      )}
      {change.phase === 'idle' && applied !== null && lastStep === applied && (
        <Note>
          <div className="flex items-center gap-3">
            <span className="flex-1 min-w-0" style={{ color: TEXT }}>✓ The graph was changed as said.</span>
            <Button size="sm" className="shrink-0" onClick={() => useGraphStore.getState().undo()}>↶ Undo</Button>
            <Button variant="quiet" size="sm" className="shrink-0" onClick={() => setApplied(null)} aria-label="Dismiss" title="Dismiss">✕</Button>
          </div>
        </Note>
      )}

      <div className="flex items-center gap-2.5 min-w-0">
        {/* A quarter of the row at most, whole in its title: at 40 % beside a
            panel at 1024 pixels it left the field 147 pixels to say anything in. */}
        <Button
          onClick={clearSelection}
          disabled={!target}
          className="h-10 shrink-0 max-w-[25%] truncate"
          title={target ? `On ${targetName(target)}. Click to say it about the whole graph instead` : 'Nothing is selected: what you say changes the graph itself'}
        >
          {target ? `on: ${targetName(target)}` : 'whole graph'}
        </Button>
        <label
          className="flex h-10 flex-1 min-w-0 items-center gap-2.5 rounded-lg px-3"
          style={{ background: SUNKEN, border: `1px solid ${LINE}` }}
        >
          <Sparkles size={14} strokeWidth={2} aria-hidden="true" style={{ color: ACCENT_TEXT, flexShrink: 0 }} />
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              void submit();
            }}
            disabled={asking}
            placeholder="Say what to change…"
            aria-label="Say what to change"
            className="flex-1 min-w-0 bg-transparent text-sm outline-none"
            style={{ color: TEXT }}
          />
        </label>
        <Button
          variant="primary"
          onClick={() => { void submit(); }}
          disabled={asking || !text.trim()}
          className="h-10 shrink-0"
          title={target && changeGoesTo(target) === 'panel'
            // A data node has no ▶ Try: what its panel writes is what it holds.
            ? `Change ${targetName(target)} as said: its panel writes it${hasDefinitions(target) ? ', and tries it' : ''}`
            : 'Change the whole graph as said, with ✨: you see what it changes before it is applied'}
        >
          Change
        </Button>
        <ProblemsChip />
      </div>
    </div>
  );
}

/** A box over the bar's row: what a change of the whole graph is doing, or came to. */
function Note({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg px-3.5 py-2.5 text-sm" style={{ background: SUNKEN, border: `1px solid ${LINE}` }} role="status">
      {children}
    </div>
  );
}

/**
 * The graph ✨ changed, before it is applied: what it says about it, what it
 * adds, removes and changes, what `check` finds in it -- and, when the graph
 * was changed here while it was asked, that applying it replaces that.
 */
function Proposal({ change, onApply, onDiscard }: {
  change: Extract<GraphAsk, { phase: 'ready' }>;
  onApply: () => void;
  onDiscard: () => void;
}) {
  // Drawn anew whenever the graph changes, and the graph read as it is then:
  // what the change is measured against.
  useGraphStore((s) => s.rfNodes);
  useGraphStore((s) => s.rfEdges);
  useGraphStore((s) => s.metadata);
  const now = useGraphStore.getState().exportGraph();
  const lines = describeChange(graphChange(now, change.graph));
  const movedOn = JSON.stringify(now) !== change.sent;
  return (
    <Note>
      <div className="max-h-[38vh] overflow-y-auto flex flex-col gap-2">
        <p style={{ color: TEXT }}>{change.explanation || 'The graph, changed as said.'}</p>
        <ul className="text-xs flex flex-col gap-0.5" style={{ color: MUTED }}>
          {lines.map((line) => (
            <li key={line} style={line.startsWith('Removes') ? { color: DANGER_TEXT } : undefined}>{line}</li>
          ))}
        </ul>
        {movedOn && (
          <p className="text-xs" style={{ color: DANGER_TEXT }}>
            The graph was changed here since this was asked: applying it replaces those changes. Undo takes it back.
          </p>
        )}
        <GraphProblems graph={change.graph} action="Apply" />
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <span className="flex-1 min-w-0 truncate text-xs" style={{ color: DIM }} title={change.said}>Asked: {change.said}</span>
        <Button size="sm" className="shrink-0" onClick={onDiscard}>Discard</Button>
        <Button variant="primary" size="sm" className="shrink-0" onClick={onApply}>Apply</Button>
      </div>
    </Note>
  );
}
