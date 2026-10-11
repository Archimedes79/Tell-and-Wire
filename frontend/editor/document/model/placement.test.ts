import { describe, expect, it } from 'vitest';
import { placement } from './placement';

const card = (id: string, kind: string, selected = false) => ({ id, selected, data: { graphNode: { node_type: kind } } });

describe('where a node goes that nobody put anywhere', () => {
  it('is a column of its own right of the selected node, else of the last that is no end point, in its row', () => {
    expect(placement([], [])).toEqual({ kind: 'gap', k: 0, r: 0 });
    const table = [['a', 'b', 'end'], [null, 'c', null]];
    const nodes = [card('a', 'code'), card('b', 'code'), card('c', 'code'), card('end', 'end')];
    expect(placement(table, nodes)).toEqual({ kind: 'gap', k: 2, r: 0 });
    expect(placement(table, nodes.map((node) => ({ ...node, selected: node.id === 'a' })))).toEqual({ kind: 'gap', k: 1, r: 0 });
    expect(placement(table, nodes.map((node) => ({ ...node, selected: node.id === 'c' })))).toEqual({ kind: 'gap', k: 2, r: 1 });
    // An end point selected is not a place to add after: it is the graph's end.
    expect(placement(table, nodes.map((node) => ({ ...node, selected: node.id === 'end' })))).toEqual({ kind: 'gap', k: 2, r: 0 });
  });
});
