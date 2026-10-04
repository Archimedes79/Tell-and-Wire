import { useId } from 'react';
import type { GraphNode } from '../../app/graph';
import { DIMMER, FIELD, MUTED } from '../../app/ui/theme';

interface Props {
  node: GraphNode;
  setConfig: (key: string, value: unknown) => void;
  /** What fails, for the tooltip: "this code", "this prompt". */
  subject: string;
}

/**
 * "Catch failures", for every kind that does work: off, a failure ends the
 * run; on, the node grows an Error output that carries the reason and the run
 * goes on. The executor handles it (`catch_errors`), not the element, so the
 * control and its words live once, here.
 */
export function CatchFailures({ node, setConfig, subject }: Props) {
  return (
    <div>
      <label className="flex items-center gap-2 text-sm" style={{ color: MUTED }}
        title={`Off, a failure in ${subject} stops the run and everything downstream is skipped. On, this node grows an Error output carrying the reason, its other outputs carry nothing, and the run goes on. Wiring that output is optional.`}>
        <input
          type="checkbox"
          checked={node.config.catch_errors === true}
          onChange={(e) => setConfig('catch_errors', e.target.checked)}
        />
        Catch failures
      </label>
      <p className="text-xs mt-1" style={{ color: DIMMER }}>
        Off, a failure ends the run. On, an <strong>Error</strong> output carries the reason and the run goes on.
      </p>
    </div>
  );
}

/**
 * What a node that authors a body has besides: how many items of a list run
 * at once. What comes in is not among these: whether a file is read is asked
 * of each input in its ports, and whether a list is taken item by item by "Run
 * once per item".
 */
export default function RunOptions({ node, setConfig, subject }: Props) {
  const id = useId();
  return (
    <>
      <CatchFailures node={node} setConfig={setConfig} subject={subject} />
      <div>
        <label className="block text-sm" style={{ color: MUTED }} htmlFor={id}>Items at once</label>
        <input
          id={id}
          type="number"
          min={0}
          className="mt-1 w-20 rounded px-2 py-1 text-sm"
          style={FIELD}
          value={Number(node.config.batch_concurrency ?? 0)}
          onChange={(e) => setConfig('batch_concurrency', Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        />
        <p className="text-xs mt-1" style={{ color: DIMMER }}>
          When it runs once per item: how many run at the same time. 0 is the default, four.
        </p>
      </div>
    </>
  );
}
