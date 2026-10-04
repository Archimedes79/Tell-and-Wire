import { describe, it, expect } from 'vitest';
import type { GraphNode, GuiWidget, Wire } from '../../app/graph';
import { NODE_KINDS } from '../../app/document/nodeKinds';
import { CONTEXT_LIMIT, graphContext } from './graphContext';

/** {Context}: the graph around a node, as every ✨ of it is told. */

const chart = { id: 'sizes', kind: 'plot_window', label: 'Sizes', shows: 'shown' } as GuiWidget;

function graph(): { nodes: GraphNode[]; edges: Wire[]; metadata: never; page: GuiWidget[] } {
  const count = { ...NODE_KINDS.code.create('count'), label: 'Count', description: 'Counts the words of each file.\nIn detail: split on spaces.' };
  const read = { ...NODE_KINDS.folder.create('read'), label: 'Read' };
  const shown = { ...NODE_KINDS.end.create('shown'), label: 'Sizes' };
  return {
    // Listed out of order: they are said in the order they run.
    nodes: [count, shown, read],
    edges: [
      { source: 'read', sourceHandle: read.outputs[0].id, target: 'count', targetHandle: 'input' },
      { source: 'count', sourceHandle: 'output', target: 'shown', targetHandle: 'value' },
    ],
    metadata: { name: 'Word counts', description: 'How long each story is.', gui_scheme: 'night' } as never,
    page: [chart],
  };
}

describe('{Context}', () => {
  it('says the graph, every node in the order it runs with the first line of its text, this one marked, and the wires', () => {
    const said = graphContext('count', graph());
    expect(said).toMatch(/^Graph: Word counts\nHow long each story is\.\n\nIts nodes, in the order they run:\n- read \(folder\) "Read"\n- count \(code\) "Count": Counts the words of each file\. {3}<- this node\n/);
    expect(said).not.toContain('In detail');
    expect(said).toContain('Its wires:\n- read.');
    expect(said).toContain('- count.output -> shown.value');
  });

  it('is cut to its budget, so a large graph leaves a small model room to answer', () => {
    const many = graph();
    many.nodes = [...many.nodes, ...Array.from({ length: 200 }, (_, n) => ({ ...NODE_KINDS.code.create(`n${n}`), description: 'x'.repeat(40) }))];
    const said = graphContext('count', many);
    expect(said.length).toBeLessThan(CONTEXT_LIMIT + 60);
    expect(said.endsWith('… (the rest of the graph is left out)')).toBe(true);
  });
});
