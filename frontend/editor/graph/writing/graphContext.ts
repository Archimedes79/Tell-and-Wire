// {Context}: the graph around a node, in words, as ✨ is told it.
//
// A node is written from its own text, and that text says what it should do --
// not what the graph it sits in is for, what comes before it and after it, or
// how large the chart it feeds will be drawn. That is what this says, once, the
// same for every ✨: the graph's name and text; every node in the order it runs,
// with its id, kind, heading and the first line of its text, this one marked;
// the wires; and the GUI -- its colour scheme, and each block with its size
// and the start and end points it connects to.
// The editor owns the GUI's grid and its schemes, so the editor says it; and
// it is cut to a budget, so a large graph leaves a small model room to answer.

import type { Graph, GraphNode, GuiWidget, Wire } from '../../document/graph';
import { blockSize } from '../../../deployment/gui/kit/layout';
import { firstLine } from '../../document/model/heading';
import { graphEdge } from '../../document/model/wires';
import { scheme } from '../../../deployment/gui/kit/ui/scheme';
import { calledBlock } from './generationContext';
import { generationOrder } from './graphSweep';

/** How much of the graph ✨ is told, in characters. */
export const CONTEXT_LIMIT = 3000;

/** The nodes in the order they run -- or as they stand, where the graph has no order (a circle a run refuses). */
function runOrder(nodes: GraphNode[], edges: Wire[]): GraphNode[] {
  try {
    return generationOrder(nodes, edges.map((edge, at) => graphEdge(edge, at)));
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
export function graphContext(nodeId: string, around: { nodes: GraphNode[]; edges: Wire[]; metadata: Graph['metadata']; gui: GuiWidget[] }): string {
  const { nodes, edges, metadata, gui } = around;
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

  if (gui.length) {
    const colours = scheme(metadata.gui_scheme);
    lines.push('', `Its GUI, on the ${colours.label} scheme -- background ${colours.sunken}, text ${colours.text}, accent ${colours.accent}:`);
    for (const widget of gui) {
      const { width, height } = blockSize(widget);
      const joined = connections(widget);
      lines.push(`- ${widget.id}: ${calledBlock(widget)}, about ${width} x ${height} px${joined ? `; ${joined}` : ''}`);
    }
  }

  const text = lines.join('\n');
  return text.length <= CONTEXT_LIMIT ? text : `${text.slice(0, CONTEXT_LIMIT)}\n… (the rest of the graph is left out)`;
}
