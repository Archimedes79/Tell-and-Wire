// Changing a schedule (`graph/schedule.ts`): where a card may be put, and putting it.
//
// A card goes into a cell, or into the gap between two columns, where a column of its
// own opens for it. Which of them are open follows from one rule: a card stands in a
// later column than every card that feeds it, and in an earlier one than every card it feeds.
// A change moves cells, and so it says where each cell went: the wires drawn through cells go with them.

import { cellName, columnsOf, parseCell, type Table } from '../schedule.ts';

/** Where a card is put: into the cell of column *c*, row *r*; or into row *r* of a new column opened before column *k*. */
export type Target = { kind: 'cell'; c: number; r: number } | { kind: 'gap'; k: number; r: number };

/** Which columns a card may stand in: a cell in column c when lo < c < hi, and a new column before k when lo < k <= hi. */
export interface Reach {
  lo: number;
  hi: number;
}

/** No limits: a card nothing is wired to. */
export const ANYWHERE: Reach = { lo: -1, hi: Infinity };

/** The columns *id* may stand in, given the wires that take part in the order (`orderedWires`). */
export function reachOf(table: Table, id: string, wires: readonly (readonly [string, string])[]): Reach {
  const column = columnsOf(table);
  let lo = -1;
  let hi = Infinity;
  for (const [from, to] of wires) {
    if (to === id && from !== id && column.has(from)) lo = Math.max(lo, column.get(from)!);
    if (from === id && to !== id && column.has(to)) hi = Math.min(hi, column.get(to)!);
  }
  return { lo, hi };
}

/** A table changed, and where its cells went: a column or row that is gone has no new place. */
export interface Moved {
  table: Table;
  column: (c: number) => number | null;
  row: (r: number) => number | null;
}

/** *table* without its empty rows and columns, and where each went. A row below the table stays below it. */
function settled(table: Table, was: { rows: number }, shift: (c: number) => number): Moved {
  const rows = table.map((row, r) => (row.some(Boolean) ? r : -1)).filter((r) => r >= 0);
  const width = Math.max(0, ...table.map((row) => row.length));
  const columns = Array.from({ length: width }, (_, c) => c).filter((c) => table.some((row) => row[c]));
  return {
    table: rows.map((r) => columns.map((c) => table[r][c] ?? null)),
    column: (c) => { const at = columns.indexOf(shift(c)); return at < 0 ? null : at; },
    row: (r) => (r >= was.rows ? rows.length + (r - was.rows) : rows.indexOf(r) < 0 ? null : rows.indexOf(r)),
  };
}

/** *id* put at *target*, taken from where it stood; the columns and rows that end up empty are gone. */
export function put(table: Table, id: string, target: Target): Moved {
  const next = table.map((row) => row.map((cell) => (cell === id ? null : cell)));
  const width = Math.max(1, ...next.map((row) => row.length));
  while (next.length <= target.r) next.push(new Array<string | null>(width).fill(null));
  if (target.kind === 'gap') {
    for (const row of next) row.splice(target.k, 0, null);
    next[target.r][target.k] = id;
  } else {
    next[target.r][target.c] = id;
  }
  return settled(next, { rows: table.length }, (c) => (target.kind === 'gap' && c >= target.k ? c + 1 : c));
}

/** *table* without *ids*. */
export function without(table: Table, ids: ReadonlySet<string>): Moved {
  return settled(table.map((row) => row.map((cell) => (cell !== null && ids.has(cell) ? null : cell))), { rows: table.length }, (c) => c);
}

/**
 * The routes of wires, the cells they are drawn through, after *moved*: each cell where it went, and
 * a route that went with a column that is gone, or into a cell a card now stands in, is no longer.
 */
export function rerouted<T extends { via?: string[] }>(edges: readonly T[], moved: Moved): T[] {
  return edges.map((edge) => {
    if (!edge.via?.length) return edge;
    const via = edge.via.flatMap((name) => {
      const cell = parseCell(name);
      const column = cell && moved.column(cell.column);
      const row = cell && moved.row(cell.row);
      return column === null || column === undefined || row === null || row === undefined || moved.table[row]?.[column] ? [] : [cellName(column, row)];
    });
    return { ...edge, via: via.length ? via : undefined };
  });
}
