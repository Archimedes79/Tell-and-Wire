import { describe, expect, it } from 'vitest';
import { parseGraph, type Graph } from '../../../graph/graph.ts';
import { registry } from '../../../graph/nodes/registry.ts';
import { blockSize, cellsOf } from '../../../gui/size.ts';
import { windowsOf } from '../../../gui/windows.ts';

describe('how large a block is', () => {
  it('is its cells, kept on the grid, and the pixels they and the gaps between them come to at most', () => {
    expect(blockSize({ w: 6, h: 3 })).toEqual({ w: 6, h: 3, width: 406, height: 196 });
    expect(blockSize({ w: 1, h: 1 })).toEqual({ w: 1, h: 1, width: 56, height: 56 });
    // None of its own: the span a new block gets. Too wide for the grid, or too low to be seen: kept on it.
    expect(cellsOf({})).toEqual({ w: 8, h: 4 });
    expect(cellsOf({ w: 40, h: 0 })).toEqual({ w: 16, h: 1 });
  });
});

/** Two nodes that draw, one into an end point a chart and a picture show, one into a path and into a node that is no end point; a button and a heading are no windows. */
const drawing = (): Graph => parseGraph({
  metadata: { name: 'plots' },
  nodes: [
    { id: 'make', node_type: 'code', inputs: [], outputs: [{ id: 'svg', name: 'svg' }, { id: 'png', name: 'png' }], config: { code: 'x' } },
    { id: 'plot', node_type: 'end', inputs: [{ id: 'value', name: 'value' }], outputs: [], config: {} },
    { id: 'picture', node_type: 'end', inputs: [{ id: 'value', name: 'value' }, { id: 'path', name: 'path' }], outputs: [], config: {} },
    { id: 'next', node_type: 'code', inputs: [{ id: 'in', name: 'in' }], outputs: [], config: { code: 'x' } },
  ],
  edges: [
    { id: 'a', source_node_id: 'make', source_port_id: 'svg', target_node_id: 'plot', target_port_id: 'value' },
    { id: 'b', source_node_id: 'make', source_port_id: 'png', target_node_id: 'picture', target_port_id: 'value' },
    { id: 'c', source_node_id: 'make', source_port_id: 'png', target_node_id: 'picture', target_port_id: 'path' },
    { id: 'd', source_node_id: 'make', source_port_id: 'svg', target_node_id: 'next', target_port_id: 'in' },
  ],
  gui: {
    blocks: [
      { id: 'title', kind: 'text', value: 'Plots' },
      { id: 'chart', kind: 'plot_window', label: 'Chart', shows: 'plot', w: 16, h: 6 },
      { id: 'photo', kind: 'image_view', shows: 'picture' },
      { id: 'again', kind: 'button', label: 'Again', shows: 'plot' },
    ],
  },
});

describe('the windows of a node', () => {
  it('are the blocks that show the end points its outputs go to, per output; a path, a node that is no end point and a block that cannot show are none', () => {
    const graph = drawing();
    const make = graph.nodes.find((one) => one.id === 'make')!;
    expect(windowsOf(graph, make, registry)).toEqual([
      { port: 'svg', block: 'chart', kind: 'plot_window', label: 'Chart', w: 16, h: 6, width: 1106, height: 406 },
      // No size of its own: the span a new block gets.
      { port: 'png', block: 'photo', kind: 'image_view', label: '', w: 8, h: 4, width: 546, height: 266 },
    ]);
    expect(windowsOf(graph, graph.nodes.find((one) => one.id === 'next')!, registry)).toEqual([]);
    expect(windowsOf({ ...graph, gui: undefined }, make, registry)).toEqual([]);
  });
});
