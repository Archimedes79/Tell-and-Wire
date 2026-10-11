// The schedule: the order a graph runs in, and where its nodes stand.
//
// A table of cells, each empty or holding one node. Read left to right, its
// columns are the steps; time runs to the right. What stands in one column
// has no wire between it, so it may run in parallel or in any order -- the
// engine takes it top to bottom. Rows say nothing of the order: they only say
// where a card stands. One rule holds it all together: an input is processed
// before its output, so every wire ends in a later column than it starts.
// Except one: a wire out of a memory (a data node) may end in an earlier column.
// It reads what the memory held when the round began (`readingWires`), and is
// how a loop goes back; one to a later column carries what the memory then holds.
//
// Stored as lines of text, one per row, ids separated by blanks and `.` for an
// empty cell (`graph-schedule.json`), so a change shows in a diff as it looks on
// the canvas. Where the cards are drawn follows from the table and from the
// sizes a person gave them -- it is no second fact to keep.

import type { Graph, GraphEdge, GraphNode } from './graph.ts';
import type { Kinds } from './nodes/NodeDefinition.ts';
import { loopNodes, readingWires, runsBefore, topologicalLevels } from './order.ts';
import type { Problem } from './wiring.ts';

/** Rows of cells; every row as long as the longest. */
export type Table = (string | null)[][];

const EMPTY = '.';
const TOKEN = /"(?:[^"\\]|\\.)*"|\S+/g;

function unquoted(token: string): string {
  if (!token.startsWith('"')) return token;
  try {
    return JSON.parse(token) as string;
  } catch {
    return token;
  }
}

/** The table a file's lines say. An id with blanks in it, or the id `.`, is written in quotes. */
export function parseTable(lines: readonly string[]): Table {
  const rows = lines
    .map((line) => (line.match(TOKEN) ?? []).map((token) => (token === EMPTY ? null : unquoted(token))))
    .filter((row) => row.length);
  const width = Math.max(0, ...rows.map((row) => row.length));
  return rows.map((row) => [...row, ...new Array<null>(width - row.length).fill(null)]);
}

/** *table* as the lines a file keeps: the cells of a column under one another. */
export function tableLines(table: Table): string[] {
  const cells = table.map((row) => row.map((id) => (id === null ? EMPTY : /[\s"]/.test(id) || id === EMPTY || id === '' ? JSON.stringify(id) : id)));
  const widths = (cells[0] ?? []).map((_, c) => Math.max(...cells.map((row) => row[c].length)));
  return cells.map((row) => row.map((cell, c) => cell.padEnd(widths[c])).join(' ').trimEnd());
}

/** The steps: the columns from left to right, each from top to bottom, without the empty ones. */
export function stepsOf(table: Table): string[][] {
  const width = Math.max(0, ...table.map((row) => row.length));
  const steps: string[][] = [];
  for (let c = 0; c < width; c++) {
    const step = table.flatMap((row) => row[c] ?? []);
    if (step.length) steps.push(step);
  }
  return steps;
}

/** *table* without its empty columns and rows. */
export function compact(table: Table): Table {
  const rows = table.filter((row) => row.some(Boolean));
  const width = Math.max(0, ...rows.map((row) => row.length));
  const keep = Array.from({ length: width }, (_, c) => c).filter((c) => rows.some((row) => row[c]));
  return rows.map((row) => keep.map((c) => row[c] ?? null));
}

/** The column each node stands in. */
export function columnsOf(table: Table): Map<string, number> {
  const columns = new Map<string, number>();
  table.forEach((row) => row.forEach((id, c) => { if (id !== null && !columns.has(id)) columns.set(id, c); }));
  return columns;
}

/** The column each node of *graph* stands in, where it has a schedule. */
export function placesOf(graph: Pick<Graph, 'schedule'>): ReadonlyMap<string, number> | undefined {
  return graph.schedule ? columnsOf(parseTable(graph.schedule)) : undefined;
}

/**
 * Who must run before whom: source and target of every wire that ends in a
 * later column than it starts. The wires that read a memory are not among them
 * (`readingWires`): they go back, and say nothing of who may stand where.
 */
export function orderedWires(nodes: GraphNode[], edges: GraphEdge[], registry: Kinds, columns?: ReadonlyMap<string, number>): [string, string][] {
  const reads = readingWires(nodes, edges, registry, columns);
  const ids = new Set(nodes.map((node) => node.id));
  return edges
    .filter((edge) => !reads.has(edge.id) && ids.has(edge.source_node_id) && ids.has(edge.target_node_id) && edge.source_node_id !== edge.target_node_id)
    .map((edge) => [edge.source_node_id, edge.target_node_id]);
}

/** Why the schedule of *graph* does not hold -- none, when it has no schedule or it holds. */
export function scheduleProblems(graph: Graph, registry: Kinds): Problem[] {
  if (!graph.schedule) return [];
  const problems: Problem[] = [];
  const ids = new Set(graph.nodes.map((node) => node.id));
  const column = new Map<string, number>();
  parseTable(graph.schedule).forEach((row) => row.forEach((id, c) => {
    if (id === null) return;
    if (!ids.has(id)) problems.push({ where: 'the schedule', problem: `It places "${id}", and there is no such node.`, fix: 'Take it out of the table.' });
    else if (column.has(id)) problems.push({ where: 'the schedule', problem: `It places "${id}" twice.`, fix: 'Leave it in one cell.' });
    else column.set(id, c);
  }));
  for (const id of ids) {
    if (!column.has(id)) problems.push({ where: `node "${id}"`, problem: 'The schedule does not place it.', fix: 'Add it to the table, or leave the schedule out to have one made from the wires.' });
  }
  // No order of columns holds a loop that no memory closes: that is said as the loop (`check`), not again for each wire of it.
  const round = new Set(loopNodes(graph.nodes, graph.edges, registry, column).map((node) => node.id));
  const seen = new Set<string>();
  for (const [from, to] of orderedWires(graph.nodes, graph.edges, registry, column)) {
    const a = column.get(from);
    const b = column.get(to);
    if (a === undefined || b === undefined || b > a || seen.has(`${from}\n${to}`) || (round.has(from) && round.has(to))) continue;
    seen.add(`${from}\n${to}`);
    problems.push({
      where: `the wire from "${from}" to "${to}"`,
      problem: `The schedule puts "${to}" ${b === a ? 'in the same column as' : 'before'} "${from}", and a wire runs from one to the other.`,
      fix: `Put "${to}" in a later column than "${from}": drag it right in the editor, or press Thin out.`,
    });
  }
  return problems;
}

/** The levels of the wires, or -- for a loop no memory closes, which is an error said elsewhere -- one node to a column. */
function levelsOf(nodes: GraphNode[], edges: GraphEdge[], registry: Kinds, columns?: ReadonlyMap<string, number>): string[][] {
  try {
    return topologicalLevels(nodes, edges, registry, columns);
  } catch {
    return nodes.map((node) => [node.id]);
  }
}

/**
 * The thinnest table for a graph: every node in the earliest column its wires
 * allow, and each column packed upward, its cards in the order of the rows
 * of the nodes that feed them -- else the order they stood in in *previous*, else
 * the graph's own. Nothing changes what runs but when, and a table with gaps runs
 * the same; this makes the picture say so.
 */
export function thinTable(nodes: GraphNode[], edges: GraphEdge[], registry: Kinds, previous?: Table): Table {
  const was = new Map<string, number>();
  if (previous) previous.forEach((row, r) => row.forEach((id) => { if (id !== null && !was.has(id)) was.set(id, r); }));
  const before = (id: string): number => was.get(id) ?? nodes.findIndex((node) => node.id === id);
  // Where they stand says which wires read a memory: they stay reads, the reader before the memory.
  const standing = previous && columnsOf(previous);
  const feeding = new Map<string, string[]>();
  for (const [from, to] of orderedWires(nodes, edges, registry, standing)) feeding.set(to, [...(feeding.get(to) ?? []), from]);
  const row = new Map<string, number>();
  const columns = levelsOf(nodes, edges, registry, standing).map((level) => {
    const want = (id: string): number => {
      const rows = (feeding.get(id) ?? []).flatMap((from) => row.get(from) ?? []);
      return rows.length ? rows.reduce((sum, one) => sum + one, 0) / rows.length : before(id);
    };
    const sorted = [...level].sort((a, b) => want(a) - want(b) || before(a) - before(b));
    sorted.forEach((id, at) => row.set(id, at));
    return sorted;
  });
  const height = Math.max(0, ...columns.map((column) => column.length));
  return Array.from({ length: height }, (_, r) => columns.map((column) => column[r] ?? null));
}

/**
 * *table* with every node after what feeds it, moved right by as little as that
 * takes, and nodes it does not place put in the first column. A node that has to
 * move keeps its row, or the next free one. A wire that reads a memory stays one:
 * what it reads stays before the memory, which moves right with it. *columns*:
 * where the nodes stood, which says which wires those are.
 */
function forward(table: Table, nodes: GraphNode[], edges: GraphEdge[], registry: Kinds, columns: ReadonlyMap<string, number>): Table {
  let order: string[];
  try {
    order = topologicalLevels(nodes, edges, registry, columns).flat();
  } catch {
    return table;
  }
  const wires = runsBefore(nodes, edges, registry, columns);
  const column = new Map<string, number>();
  const row = new Map<string, number>();
  table.forEach((cells, r) => cells.forEach((id, c) => { if (id !== null) { column.set(id, c); row.set(id, r); } }));
  const moved = new Map<string, number>();
  for (const id of order) {
    const after = wires.filter(([, to]) => to === id).map(([from]) => (moved.get(from) ?? 0) + 1);
    moved.set(id, Math.max(column.get(id) ?? 0, ...after));
  }
  if ([...moved].every(([id, c]) => column.get(id) === c)) return table;
  const width = Math.max(0, ...moved.values()) + 1;
  const cells: Table = table.map(() => new Array<string | null>(width).fill(null));
  const reading = [...moved.keys()].sort((a, b) => (row.get(a) ?? 0) - (row.get(b) ?? 0) || (column.get(a) ?? 0) - (column.get(b) ?? 0));
  for (const id of reading) {
    let r = row.get(id) ?? 0;
    const c = moved.get(id)!;
    for (;; r++) {
      if (!cells[r]) cells.push(new Array<string | null>(width).fill(null));
      if (cells[r][c] === null) break;
    }
    cells[r][c] = id;
  }
  return cells;
}

/**
 * The table a graph stands in: *lines* made to hold for it with the least change
 * -- a node that is gone leaves, one it does not place comes in at the left, and
 * every node moves right of what feeds it, unless it reads a memory -- or, with
 * none, the thin one.
 */
export function tableFor(nodes: GraphNode[], edges: GraphEdge[], registry: Kinds, lines?: readonly string[]): Table {
  if (!lines) return thinTable(nodes, edges, registry);
  const ids = new Set(nodes.map((node) => node.id));
  const placed = new Set<string>();
  const table = parseTable(lines).map((row) => row.map((id) => {
    if (id === null || !ids.has(id) || placed.has(id)) return null;
    placed.add(id);
    return id;
  }));
  const width = Math.max(1, ...table.map((row) => row.length));
  // Taken before a node it does not place comes in: that one has no column to say what its wires are.
  const standing = columnsOf(table);
  for (const node of nodes) if (!placed.has(node.id)) table.push([node.id, ...new Array<null>(width - 1).fill(null)]);
  return compact(forward(table, nodes, edges, registry, standing));
}

/** The name of the cell in column *column*, row *row* (both counted from 0), as a spreadsheet says it: `C2`. */
export function cellName(column: number, row: number): string {
  let letters = '';
  for (let n = column + 1; n > 0; n = Math.floor((n - 1) / 26)) letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  return `${letters}${row + 1}`;
}

/** The column and row a cell name says, or null for what is not one. */
export function parseCell(name: string): { column: number; row: number } | null {
  const found = /^([A-Z]+)([1-9][0-9]*)$/.exec(name);
  if (!found) return null;
  const column = [...found[1]].reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0) - 1;
  return { column, row: Number(found[2]) - 1 };
}

/** Wires drawn through a cell that is not there or is taken by a node: how they are drawn is wrong, and nothing else. */
export function routeProblems(graph: Graph): Problem[] {
  const table = graph.schedule ? parseTable(graph.schedule) : [];
  const problems: Problem[] = [];
  for (const edge of graph.edges) {
    for (const name of edge.via ?? []) {
      const cell = parseCell(name);
      const holds = cell ? table[cell.row]?.[cell.column] : undefined;
      const outside = !cell || cell.row > table.length || cell.column >= Math.max(0, ...table.map((row) => row.length));
      if (!outside && !holds) continue;
      problems.push({
        where: `edge "${edge.id}"`,
        problem: outside ? `It is drawn via ${name}, and the schedule has no such cell.` : `It is drawn via ${name}, where node "${holds}" stands.`,
        fix: 'Draw it through an empty cell of the schedule, or take its route off.',
      });
    }
  }
  return problems;
}
