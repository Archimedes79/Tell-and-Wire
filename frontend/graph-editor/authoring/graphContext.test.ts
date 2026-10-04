import { describe, it, expect } from 'vitest';
import type { GraphNode, GuiWidget, Wire } from '../../app/graph';
import { NODE_KINDS } from '../../app/document/nodeKinds';
import { blockSize } from '../../app/document/layout';
import { scheme } from '../../app/ui/scheme';
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

  it('says the page: its colour scheme, and each block with its size and what it connects to, as the editor draws it', () => {
    const colours = scheme('night');
    const { width, height } = blockSize(chart);
    const said = graphContext('count', graph());
    expect(said).toContain(`Its page, on the ${colours.label} scheme -- background ${colours.sunken}, text ${colours.text}, accent ${colours.accent}:`);
    expect(said).toContain(`- sizes: a chart block "Sizes", about ${width} x ${height} px; shows "shown"`);
  });

  it('names each block as a person calls it, in the mode it is in -- not by the file format\'s kind', () => {
    const blocks = [
      { id: 'pick', kind: 'input_picker', mode: 'file', label: 'CSV', sends_to: ['go'], fires: 'go' }, { id: 'dir', kind: 'input_picker', mode: 'directory', label: 'Reports' },
      { id: 'said', kind: 'text_io', mode: 'output', label: 'Mood' }, { id: 'pic', kind: 'image_view', label: 'Photo' },
    ] as GuiWidget[];
    const said = graphContext('go', { nodes: [NODE_KINDS.start.create('go')], edges: [], metadata: { name: 'Blocks' } as never, page: blocks });
    expect(said).toMatch(/- pick: a file picker block "CSV", about \d+ x \d+ px; sends to "go", fires "go"/);
    expect(said).toMatch(/- dir: a folder picker block "Reports", about/);
    expect(said).toMatch(/- said: a text output block "Mood", about/);
    expect(said).toMatch(/- pic: an image block "Photo", about/);
    expect(said).not.toMatch(/input_picker|text_io|image_view/);
  });

  it('is cut to its budget, so a large graph leaves a small model room to answer', () => {
    const many = graph();
    many.nodes = [...many.nodes, ...Array.from({ length: 200 }, (_, n) => ({ ...NODE_KINDS.code.create(`n${n}`), description: 'x'.repeat(40) }))];
    const said = graphContext('count', many);
    expect(said.length).toBeLessThan(CONTEXT_LIMIT + 60);
    expect(said.endsWith('… (the rest of the graph is left out)')).toBe(true);
  });

  it('still says every node where the graph has no order -- a circle a run refuses', () => {
    const circle = graph();
    circle.edges = [...circle.edges, { source: 'count', sourceHandle: 'output', target: 'read', targetHandle: 'x' }];
    circle.edges.push({ source: 'read', sourceHandle: 'files', target: 'count', targetHandle: 'input' });
    const said = graphContext('count', circle);
    for (const id of ['count', 'shown', 'read']) expect(said).toContain(`- ${id} (`);
  });
});
