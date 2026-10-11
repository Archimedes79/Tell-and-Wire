import { describe, it, expect } from 'vitest';
import type { Graph, GraphEdge, GraphNode } from './graph.ts';
import { registry } from './nodes/registry.ts';
import { loopNodes, readingWires } from './order.ts';
import { columnsOf, parseTable, scheduleProblems, stepsOf, tableFor, tableLines, thinTable } from './schedule.ts';

function node(id: string, type = 'code', config: Record<string, unknown> = {}): GraphNode {
  return { id, node_type: type as GraphNode['node_type'], label: id, description: '', position: { x: 0, y: 0 }, inputs: [], outputs: [], config };
}
const wire = (id: string, from: string, out: string, to: string, into: string): GraphEdge => (
  { id, source_node_id: from, source_port_id: out, target_node_id: to, target_port_id: into });

// start -> a and b, which stand beside each other -> c, which also reads the memory m and fills it.
const nodes = [node('start', 'start'), node('a'), node('b'), node('c'), node('m', 'data', { data_value: { value: 'old' } })];
const edges = [
  wire('1', 'start', 'out', 'a', 'in'), wire('2', 'start', 'out', 'b', 'in'),
  wire('3', 'a', 'out', 'c', 'x'), wire('4', 'b', 'out', 'c', 'y'),
  wire('read', 'm', 'value', 'c', 'z'), wire('write', 'c', 'out', 'm', 'value'),
];
const graph = (schedule: string[]): Graph => ({ metadata: { name: '', description: '', gui_scheme: 'night' }, nodes, edges, schedule });

describe('the schedule', () => {
  it('is lines of text, cells of a column under one another; an id that needs it is quoted; the steps are the columns', () => {
    const table = parseTable(['start a  .  c', '.     b  .  "my node"', '  ', '.  .  m  .']);
    expect(table).toEqual([['start', 'a', null, 'c'], [null, 'b', null, 'my node'], [null, null, 'm', null]]);
    expect(tableLines(table)).toEqual(['start a . c', '.     b . "my node"', '.     . m .']);
    expect(parseTable(tableLines(table))).toEqual(table);
    expect(stepsOf(table)).toEqual([['start'], ['a', 'b'], ['m'], ['c', 'my node']]);
  });

  it('is thin when made from the wires: the earliest column each node can stand in, a memory after what fills it; a table a person arranged keeps its row order', () => {
    expect(tableLines(thinTable(nodes, edges, registry))).toEqual(['start a c m', '.     b . .']);
    expect(tableLines(thinTable(nodes, edges, registry, [['start', null, 'b', 'c', 'm'], [null, 'a', null, null, null]]))).toEqual(['start b c m', '.     a . .']);
  });

  it('holds when every wire but one that leaves a memory ends in a later column, and says which does not', () => {
    // The memory stands right of c, which fills it; c reads it by a wire that runs back and takes no part in the order.
    expect(scheduleProblems(graph(['start a c m', '.     b . .']), registry)).toEqual([]);
    expect(scheduleProblems(graph(['start c a m', '.     b . .']), registry).map((problem) => problem.where))
      .toEqual(['the wire from "a" to "c"', 'the wire from "b" to "c"']);
    expect(scheduleProblems(graph(['start a b c', 'ghost . . m']), registry).map((problem) => problem.problem))
      .toEqual(['It places "ghost", and there is no such node.']);
    // A wire that closes a loop no memory closes has no later column to end in: the loop is the problem, said by `check`.
    const circle = { ...graph(['start a c m', '.     b . .']), edges: [...edges, wire('back', 'c', 'out', 'a', 'in')] };
    expect(scheduleProblems(circle, registry)).toEqual([]);
  });

  it('lets where a memory stands say what its wires carry: to a card before it, what it held when the round began, else what it holds then', () => {
    const reads = (...rows: string[]) => [...readingWires(nodes, edges, registry, columnsOf(parseTable(rows)))];
    // c stands before m: the wire back to it is a read, and holds.
    expect(reads('start a c m', '.     b . .')).toEqual(['read']);
    // Without a schedule the wire that closes the loop is the read.
    expect([...readingWires(nodes, edges, registry)]).toEqual(['read']);
    // m before c, or beside it: the same wire carries what m holds then -- and with c writing m, that is a loop no memory closes: said as the loop.
    for (const rows of [['start a m c', '.     b . .'], ['start a b c', '.     . . m']]) {
      expect(reads(...rows)).toEqual([]);
      expect(loopNodes(nodes, edges, registry, columnsOf(parseTable(rows))).map((one) => one.id)).toEqual(['c', 'm']);
      expect(scheduleProblems(graph(rows), registry)).toEqual([]);
    }
    // Kept right of what it reads, where a card moves: c may not be pulled right of m, nor m left of c.
    expect(tableLines(tableFor(nodes, edges, registry, ['start a b c m']))).toEqual(['start a b c m']);
    expect(tableLines(thinTable(nodes, edges, registry, [['start', 'a', 'c', 'm'], [null, 'b', null, null]]))).toEqual(['start a c m', '.     b . .']);
  });

  it('is made to hold for a graph that moved on: gone nodes leave, new ones come in at the left, and each node moves right of what feeds it, by as little as that takes', () => {
    expect(tableLines(tableFor(nodes, edges, registry, ['start ghost a b', '.     .     c m']))).toEqual(['start a b . .', '.     . . c m']);
    expect(tableLines(tableFor(nodes, edges, registry, ['start a b c m']))).toEqual(['start a b c m']);
    // Nothing placed: the thin table.
    expect(tableFor(nodes, edges, registry)).toEqual(thinTable(nodes, edges, registry));
  });
});
