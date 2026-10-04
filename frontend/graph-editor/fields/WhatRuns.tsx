import type { GraphNode } from '../../app/graph';
import { registry as runnerRegistry } from '../../../graph/nodes/registry.ts';
import { DIMMER, LINE, MUTED } from '../../app/ui/theme';

/**
 * What runs when this node runs: the file in its folder, or the runner class
 * that does the work, and in one sentence what that is. Folded, and the last
 * thing in every node's panel: for the curious.
 *
 * Asked of the node's runner (`whatRuns`), so the panel and the documentation
 * say the same thing in the same words.
 */
export default function WhatRuns({ node }: { node: GraphNode }) {
  const runs = runnerRegistry.node(node.node_type)?.whatRuns(node as never);
  if (!runs?.does) return null;
  return (
    <details className="rounded-lg" style={{ border: `1px solid ${LINE}` }}>
      <summary className="px-3 py-2 text-xs font-medium cursor-pointer select-none" style={{ color: MUTED }}>
        What runs, technically
      </summary>
      <div className="px-3 pb-3 text-xs">
        <p style={{ color: DIMMER }}>
          <code>{runs.where}</code>{runs.by === 'body' ? ', in a sandboxed process of its own' : ', in the process that runs the graph'}
        </p>
        <p className="mt-1" style={{ color: DIMMER }}>{runs.does}</p>
      </div>
    </details>
  );
}
