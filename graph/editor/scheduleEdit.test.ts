import { describe, it, expect } from 'vitest';
import { cellName, parseCell, routeProblems, tableLines, type Table } from '../schedule.ts';
import { graphFrom, wireLine } from '../files/flow.ts';
import { put, reachOf, rerouted, without } from './scheduleEdit.ts';

const table: Table = [['a', 'b', 'c', 'd'], [null, 'e', null, null]];

describe('changing a schedule', () => {
  it('limits a card to the columns between what feeds it and what it feeds, and puts it into a cell or a column of its own', () => {
    const wires: [string, string][] = [['a', 'b'], ['b', 'c'], ['e', 'd'], ['c', 'd']];
    expect(reachOf(table, 'b', wires)).toEqual({ lo: 0, hi: 2 });
    expect(reachOf(table, 'a', wires)).toEqual({ lo: -1, hi: 1 });
    // A memory's wires bound nothing but its own column: a card it is wired to may stand either side of it, and the memory either side of that card.
    expect(reachOf(table, 'b', [], [['c', 'b']])).toEqual({ lo: -1, hi: Infinity, apart: [2] });
    expect(reachOf(table, 'c', [], [['c', 'b'], ['c', 'e']])).toEqual({ lo: -1, hi: Infinity, apart: [1] });
    // Into a free cell: the column it left closes when it was alone there.
    expect(tableLines(put(table, 'c', { kind: 'cell', c: 2, r: 1 }).table)).toEqual(['a b . d', '. e c .']);
    // Into a column of its own, opened before column 1: the others after it slide over.
    expect(tableLines(put(table, 'e', { kind: 'gap', k: 1, r: 1 }).table)).toEqual(['a . b c d', '. e . . .']);
    expect(tableLines(without(table, new Set(['b', 'e'])).table)).toEqual(['a c d']);
  });

  it('carries the cells a wire is drawn through with the cells they name, and drops a route whose cell went or was taken', () => {
    expect([cellName(0, 0), cellName(2, 1), cellName(26, 9), cellName(27, 0)]).toEqual(['A1', 'C2', 'AA10', 'AB1']);
    expect(parseCell('AA10')).toEqual({ column: 26, row: 9 });
    expect(parseCell('c2')).toBeNull();
    const edges = [{ id: 'w', via: ['C2'] }, { id: 'x', via: ['D3'] }, { id: 'y' }];
    // A column opens before the second: C2 is the cell right of it now, D2.
    const moved = put(table, 'e', { kind: 'gap', k: 1, r: 1 });
    expect(rerouted(edges, moved).map((edge) => edge.via)).toEqual([['D2'], ['E3'], undefined]);
    // A card put into the cell the wire went through: that wire is straight again.
    expect(rerouted(edges, put(table, 'e', { kind: 'cell', c: 2, r: 1 })).map((edge) => edge.via)).toEqual([undefined, ['D3'], undefined]);
  });

  it('writes a route after "via" in the flow and reads it back; a cell it cannot read is refused, and one a card stands in is a problem', () => {
    const nodes = { a: { kind: 'code' }, b: { kind: 'code' } };
    const flow = { name: 'x', wires: ['a.o -> b.i via B1 C1'] };
    const graph = graphFrom(flow, nodes, 'flow', 'nodes');
    expect(graph.edges[0]).toMatchObject({ id: 'a.o -> b.i', via: ['B1', 'C1'] });
    expect(wireLine(graph.edges[0])).toBe('a.o -> b.i via B1 C1');
    expect(() => graphFrom({ wires: ['a.o -> b.i via 2B'] }, nodes, 'flow', 'nodes')).toThrow(/not a cell/);
    const scheduled = { ...graph, schedule: ['a b'] };
    expect(routeProblems(scheduled).map((problem) => problem.problem)).toEqual(['It is drawn via B1, where node "b" stands.', 'It is drawn via C1, and the schedule has no such cell.']);
  });
});
