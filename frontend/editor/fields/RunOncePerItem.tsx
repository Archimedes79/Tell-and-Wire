import { useRef } from 'react';
import type { GraphNode } from '../document/graph';
import { useGraphNodes, useGraphStore } from '../document/store/graphStore';
import { listPorts, runsPerItem, withPerItem } from '../graph/writing/perItem';
import { hasDefinitions } from '../graph/writing/generation';
import { definitionExample, definitionsIn } from '../../../graph/files/definition.ts';
import { ONCE, type NodePanelProps } from '../graph/nodes/NodeGuiBuilder';
import { DIMMER, MUTED } from '../../deployment/gui/kit/ui/theme';

/** The example in *node*'s input.js, where it has one that can be read. */
function exampleOf(node: GraphNode): Record<string, unknown> | undefined {
  const input = definitionsIn(node).input;
  if (!input.trim()) return undefined;
  const read = definitionExample(input);
  return 'example' in read ? read.example : undefined;
}

/**
 * "Run once per item": the one question about a list, asked only when a list
 * arrives -- down a wire, as a port declared one, or in the example. Ticked, a
 * list is taken an item at a time and what comes out is a list of the results;
 * an input can then be taken whole beside it ("whole list", in the ports).
 */
export default function RunOncePerItem({ node, updateNode, subject }: Pick<NodePanelProps, 'node' | 'updateNode'> & { subject: string }) {
  const nodes = useGraphNodes();
  const edges = useGraphStore((s) => s.rfEdges);
  const lists = listPorts(node, exampleOf(node), nodes, edges);
  // Once asked, the question stays while the panel is open: unticked, no input
  // is declared a list any more, and the box would vanish under the click.
  const asked = useRef(false);
  if (lists.length || runsPerItem(node)) asked.current = true;
  if (!asked.current) return null;
  const checked = runsPerItem(node);
  const oneCall = hasDefinitions(node) ? ' -- input.js and output.js say one call;' : ';';
  return (
    <div>
      <label className="flex items-center gap-2 text-sm" style={{ color: MUTED }}
        title={`A list arrives. Ticked, ${subject} runs once for each item in it${oneCall} what comes out is a list of the results. Unticked, it gets the list whole, once -- for totals, summaries, merges.`}>
        <input type="checkbox" checked={checked}
          onChange={(event) => updateNode((current) => withPerItem(current, event.target.checked, lists), ONCE)} />
        Run once per item
      </label>
      <p className="text-xs mt-0.5" style={{ color: DIMMER }}>
        {checked ? `A list arrives: ${subject} runs once for each item.` : `A list arrives: ${subject} gets it whole, once.`}
      </p>
    </div>
  );
}
