import { useEffect, useState } from 'react';
import { DANGER_TEXT, DIM, FIELD, TEXT } from '../../../app/ui/theme';
import { parseInterval } from '../../../../graph/execution/triggers.ts';
import { StartNodeRunner } from '../../../../graph/nodes/start/StartNodeRunner.ts';
import { useGraphStore } from '../../../app/store/graphStore';
import type { NodePanelProps } from '../NodeGuiBuilder';

const START = new StartNodeRunner();

/** Who starts a start point, in the words the panel offers it. */
const STARTERS = [
  ['page', 'The page', 'a block on it: a button, Enter in a text box, a choice made -- the graph then needs its page'],
  ['call', 'A call', 'a script, a model over MCP, or the graph above, by this start point\'s name'],
  ['itself', 'Itself', 'when the tool starts, and again on a clock'],
] as const;

/** *text* as names and values -- what a caller sends -- or why it is not one. */
function namesAndValues(text: string): { values: Record<string, unknown> } | { problem: string } {
  try {
    const read: unknown = JSON.parse(text || '{}');
    if (read && typeof read === 'object' && !Array.isArray(read)) return { values: read as Record<string, unknown> };
    return { problem: 'Names and values, in braces: {"text": "One sentence."}' };
  } catch {
    return { problem: 'Not JSON yet: names in quotes, a colon, a value -- {"text": "One sentence."}' };
  }
}

/**
 * What a call sends a start point, for example: what it is sent when nobody
 * sends it anything -- a run of the graph on its own, ▶ Try, and what ✨ is
 * shown -- and the parts an input wired from it can take.
 */
function ExampleSent({ node, setConfig }: Pick<NodePanelProps, 'node' | 'setConfig'>) {
  const kept = JSON.stringify(node.config.values ?? {}, null, 2);
  const [text, setText] = useState(kept);
  // Put back from outside -- an undo, a change made by ✨ -- unless it is what is being typed.
  useEffect(() => {
    setText((typed) => {
      const read = namesAndValues(typed);
      return 'values' in read && JSON.stringify(read.values, null, 2) === kept ? typed : kept;
    });
  }, [kept]);
  const read = namesAndValues(text);
  // In a graph a node holds: the example held to what the graph above sends
  // it, which `check` says too (`handedDownProblems`).
  const held = useGraphStore((s) => s.subgraphStack.length > 0);
  const [unsent] = held ? START.handedDownProblems(node as never, '') : [];
  return (
    <div className="mb-3">
      <label className="block text-xs mb-1" style={{ color: DIM }} htmlFor={`sent-${node.id}`}>What a call sends it, for example</label>
      <textarea
        id={`sent-${node.id}`}
        className="w-full rounded-lg px-3 py-2 text-xs font-mono resize-y"
        style={{ ...FIELD, minHeight: 72 }}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const next = namesAndValues(e.target.value);
          if ('values' in next) setConfig('values', next.values, { field: `values-${node.id}` });
        }}
        aria-label="What a call sends it, for example"
      />
      <span className="block text-xs mt-1" style={{ color: 'problem' in read || unsent ? DANGER_TEXT : DIM }}>
        {'problem' in read
          ? read.problem
          : unsent
            ? `${unsent.problem} ${unsent.fix}`
            : 'It is sent this when nobody sends it anything: the graph run on its own, ▶ Try. An input wired from here can take one of its parts.'}
      </span>
    </div>
  );
}

export default function StartNodePanel({ node, setConfig }: NodePanelProps) {
  const startedBy = String(node.config.started_by ?? 'page');
  const every = String(node.config.every ?? '');
  // Said while it is being typed, in the engine's own words: the same function
  // reads this field when the tool runs, so what it rejects here it would
  // reject there -- at three in the morning, in a log nobody is reading.
  let problem = '';
  try {
    if (every.trim()) parseInterval(every);
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }

  return (
    <div>
      <fieldset className="mb-3">
        <legend className="text-xs mb-2" style={{ color: DIM }}>Started by</legend>
        {STARTERS.map(([value, label, what]) => (
          <label key={value} className="flex items-start gap-2 text-sm mb-1.5" style={{ color: TEXT }}>
            <input
              type="radio"
              name={`started-by-${node.id}`}
              checked={startedBy === value}
              onChange={() => setConfig('started_by', value)}
              style={{ marginTop: 3 }}
            />
            <span>
              {label}
              <span className="block text-xs" style={{ color: DIM }}>{what}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {startedBy === 'call' && <ExampleSent node={node} setConfig={setConfig} />}
      {startedBy === 'itself' && (
        <div className="mb-3">
          <label className="flex items-center gap-2 text-sm mb-2" style={{ color: TEXT }}>
            <input
              type="checkbox"
              checked={node.config.on_start !== false}
              onChange={(e) => setConfig('on_start', e.target.checked)}
            />
            When the tool starts
          </label>
          <label className="flex items-center gap-2 text-sm" style={{ color: TEXT }}>
            <span>Again every</span>
            <input
              className="rounded-lg px-2 py-1 text-sm font-mono"
              style={{ ...FIELD, width: 90 }}
              value={every}
              onChange={(e) => setConfig('every', e.target.value)}
              placeholder="never"
              aria-label="Interval"
            />
            <span className="text-xs" style={{ color: problem ? DANGER_TEXT : DIM }}>
              {problem || '45, 30s, 5m, 2h or 1d — counted from the end of one round to the start of the next'}
            </span>
          </label>
        </div>
      )}
      <p className="text-xs" style={{ color: DIM }}>
        It hands on one package, <code>{'{event, values}'}</code>, to what its <code>data</code> is wired to: the
        values under the names the sender gave them. The first node it reaches reads what it needs out of it.
        In a round it did not begin, <code>event</code> is empty and the values are the ones it was sent last.
      </p>
    </div>
  );
}
