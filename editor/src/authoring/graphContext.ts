// {Context}: the graph around a node, in words, as ✨ is told it.
//
// A node is written from its own text, and that text says what it should do --
// not what the graph it sits in is for, what comes before it and after it, or
// how large the chart it feeds will be drawn. That is what this says, once, the
// same for every ✨: the graph's name and text; every node in the order it runs,
// with its id, kind, heading and the first line of its text, this one marked;
// the wires; and the page -- its colour scheme, and each block with its size
// and the start and end points it connects to.
// The editor owns the page's grid and its schemes, so the editor says it; and
// it is cut to a budget, so a large graph leaves a small model room to answer.

import type { Graph, GraphNode, GuiWidget, Wire } from '@/graph';
import { memoryFeedbackEdges, topologicalLevels } from '@engine/execution/executor.ts';
import { registry } from '@engine/elements/registry.ts';
import { blockSize } from '@/document/layout';
import { firstLine } from '@/document/heading';
import { graphEdge } from '@/document/wires';
import { scheme } from '@/ui/scheme';
import { calledBlock } from './generationContext';

/** How much of the graph ✨ is told, in characters. */
export const CONTEXT_LIMIT = 3000;

/** The nodes in the order they run -- or as they stand, where the graph has no order (a circle a run refuses). */
function runOrder(nodes: GraphNode[], edges: Wire[]): GraphNode[] {
  const saved = edges.map((edge, at) => graphEdge(edge, at));
  try {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const order = topologicalLevels(nodes, saved, memoryFeedbackEdges(nodes, saved, registry)).flat();
    return order.map((id) => byId.get(id)).filter((node): node is GraphNode => !!node);
  } catch {
    return nodes;
  }
}

/** How *widget* connects, in words: `sends to "start", fires "start", shows "result"`. */
function connections(widget: GuiWidget): string {
  return [
    widget.sends_to?.length ? `sends to ${widget.sends_to.map((id) => `"${id}"`).join(', ')}` : '',
    widget.fires ? `fires "${widget.fires}"` : '',
    widget.shows ? `shows "${widget.shows}"` : '',
  ].filter(Boolean).join(', ');
}

/** {Context} for node *nodeId*: the graph it is in, cut to `CONTEXT_LIMIT`. */
export function graphContext(nodeId: string, around: { nodes: GraphNode[]; edges: Wire[]; metadata: Graph['metadata']; page: GuiWidget[] }): string {
  const { nodes, edges, metadata, page } = around;
  const lines = [`Graph: ${metadata.name}`];
  if (metadata.description?.trim()) lines.push(metadata.description.trim());

  lines.push('', 'Its nodes, in the order they run:');
  for (const node of runOrder(nodes, edges)) {
    const said = firstLine(node.description ?? '');
    lines.push(`- ${node.id} (${node.node_type}) "${node.label || node.id}"${said ? `: ${said}` : ''}${node.id === nodeId ? '   <- this node' : ''}`);
  }

  if (edges.length) {
    lines.push('', 'Its wires:');
    for (const edge of edges) lines.push(`- ${edge.source}.${edge.sourceHandle ?? ''} -> ${edge.target}.${edge.targetHandle ?? ''}`);
  }

  if (page.length) {
    const colours = scheme(metadata.gui_scheme);
    lines.push('', `Its page, on the ${colours.label} scheme -- background ${colours.sunken}, text ${colours.text}, accent ${colours.accent}:`);
    for (const widget of page) {
      const { width, height } = blockSize(widget);
      const joined = connections(widget);
      lines.push(`- ${widget.id}: ${calledBlock(widget)}, about ${width} x ${height} px${joined ? `; ${joined}` : ''}`);
    }
  }

  const text = lines.join('\n');
  return text.length <= CONTEXT_LIMIT ? text : `${text.slice(0, CONTEXT_LIMIT)}\n… (the rest of the graph is left out)`;
}
