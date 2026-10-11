// Where a schedule (`graph/schedule.ts`) puts the cards on the canvas, and where a card being
// dragged would land.
//
// A column is as wide as its widest card, a row as tall as its tallest, with room between them
// for the wires; everything after a column or row that grew moves over by what it grew. Nothing
// here is stored: the table and the sizes a person gave are the truth, and this is what is drawn.
// A card stands on the centre of its cell.

import type { Table } from '../../../../graph/schedule.ts';
import { allows, type Reach, type Target } from '../../../../graph/editor/scheduleEdit.ts';

/** What a card is taken to measure: what most come to, and so what the cell is centred on. */
export const CARD = { width: 240, height: 110 };
/** A cell: at least this wide and high, a card that was made bigger widens its column and heightens its row. */
const CELL = { width: 260, height: 160 };
/** The room a wire needs between two columns and between two rows. */
export const GAP = { x: 160, y: 66 };
/** Where the table starts. Above it stands the ruler. */
export const MARGIN = { x: 60, y: 150 };
/** The sizes a person gave cards snap to the dots of the canvas, and are no smaller than a card. */
export const SNAP = 22;

export interface Size {
  width: number;
  height: number;
}

export interface Grid {
  cols: { left: number; right: number; centre: number }[];
  rows: { top: number; bottom: number; centre: number }[];
  /** The centre of each card. */
  centres: Map<string, { x: number; y: number }>;
}

/** What the grid has room for besides the table: an empty column opened before column *column*, and an empty row at the bottom. */
export interface Opening {
  column?: number | null;
  row?: boolean;
}

export function gridOf(table: Table, sizes: ReadonlyMap<string, Size>, opening: Opening = {}): Grid {
  const open = opening.column ?? null;
  const columns = Math.max(0, ...table.map((row) => row.length)) + (open === null ? 0 : 1);
  const rows = table.length + (opening.row ? 1 : 0);
  const shifted = (c: number): number => (open !== null && c >= open ? c + 1 : c);
  const wide = new Array<number>(columns).fill(CELL.width);
  const high = new Array<number>(rows).fill(CELL.height);
  table.forEach((row, r) => row.forEach((id, c) => {
    const size = id === null ? undefined : sizes.get(id);
    if (!size) return;
    wide[shifted(c)] = Math.max(wide[shifted(c)], size.width);
    high[r] = Math.max(high[r], size.height);
  }));
  const cols: Grid['cols'] = [];
  let x = MARGIN.x;
  for (const width of wide) {
    cols.push({ left: x, right: x + width, centre: x + width / 2 });
    x += width + GAP.x;
  }
  const rowsOut: Grid['rows'] = [];
  let y = MARGIN.y;
  for (const height of high) {
    rowsOut.push({ top: y, bottom: y + height, centre: y + height / 2 });
    y += height + GAP.y;
  }
  const centres = new Map<string, { x: number; y: number }>();
  table.forEach((row, r) => row.forEach((id, c) => {
    if (id !== null && !centres.has(id)) centres.set(id, { x: cols[shifted(c)].centre, y: rowsOut[r].centre });
  }));
  return { cols, rows: rowsOut, centres };
}

/** Where a card of *size* stands, as ReactFlow wants it: its top left, from its centre. */
export const topLeft = (centre: { x: number; y: number }, size: Size = CARD): { x: number; y: number } => (
  { x: centre.x - size.width / 2, y: centre.y - size.height / 2 });

/** A size snapped to the dots, never smaller than a card's cell holds. */
export const snapped = (size: Size): Size => ({
  width: Math.max(Math.round(CARD.width / SNAP) * SNAP, Math.round(size.width / SNAP) * SNAP),
  height: Math.max(Math.round(CARD.height / SNAP) * SNAP, Math.round(size.height / SNAP) * SNAP),
});

/** Where a card being held would land, and which column opens for it on the way. */
export interface Aim {
  /** The empty column opened before this one, while the card is held in the space between two columns. */
  opens: number | null;
  /** The cell it would be pulled to, in the grid with that column open (`gridOf`). */
  target: (Target & { column: number }) | null;
}

/**
 * Where a card whose centre is at *centre* would land: in the space between two columns -- if a
 * column of its own may open there -- a new column opens, and the nearest cell of the others is
 * the one it is pulled to. *opened* is the column already open for it: it stays open until the card
 * leaves its width, so the columns do not shake as they move.
 */
export function aim(table: Table, sizes: ReadonlyMap<string, Size>, reach: Reach, self: string | null, centre: { x: number; y: number }, opened: number | null): Aim {
  const base = gridOf(table, sizes, { row: true });
  const columns = base.cols.length;
  const allowed = (k: number): boolean => reach.lo < k && k <= reach.hi;
  let opens: number | null = null;
  if (opened !== null && allowed(opened)) {
    const grid = gridOf(table, sizes, { column: opened, row: true });
    const before = opened > 0 ? grid.cols[opened - 1].right : -Infinity;
    if (centre.x > before + 8 && centre.x < grid.cols[opened].right + GAP.x / 2) opens = opened;
  }
  for (let k = 0; opens === null && k <= columns; k++) {
    const from = k > 0 ? base.cols[k - 1].right + 16 : -Infinity;
    const to = k < columns ? base.cols[k].left - 16 : Infinity;
    if (centre.x > from && centre.x < to && allowed(k)) opens = k;
  }
  if (opens !== null) {
    const grid = gridOf(table, sizes, { column: opens, row: true });
    let r = 0;
    grid.rows.forEach((row, at) => { if (Math.abs(row.centre - centre.y) < Math.abs(grid.rows[r].centre - centre.y)) r = at; });
    return { opens, target: { kind: 'gap', k: opens, r, column: opens } };
  }
  let best: Aim['target'] = null;
  let far = Infinity;
  for (let c = 0; c < columns; c++) {
    if (!allows(reach, c)) continue;
    for (let r = 0; r < base.rows.length; r++) {
      const there = table[r]?.[c];
      if (there && there !== self) continue;
      const away = (base.cols[c].centre - centre.x) ** 2 + (base.rows[r].centre - centre.y) ** 2;
      if (away < far) { far = away; best = { kind: 'cell', c, r, column: c }; }
    }
  }
  return { opens: null, target: best };
}

/** Whether the cell of column *c*, row *r* of the grid with column *opened* open is one the card may be pulled to. */
export function isOpen(table: Table, reach: Reach, self: string | null, opened: number | null, c: number, r: number): boolean {
  if (opened !== null && c === opened) return true;
  const was = opened !== null && c > opened ? c - 1 : c;
  const there = table[r]?.[was];
  return allows(reach, was) && (!there || there === self);
}

/**
 * The free cell nearest *centre* that a wire from column *from* to column *to* may be drawn through:
 * one of the columns between them, in any row -- and a row below the table. None when they stand side by side.
 */
export function routeAim(table: Table, grid: Grid, from: number, to: number, centre: { x: number; y: number }): { column: number; row: number } | null {
  let best: { column: number; row: number } | null = null;
  let far = Infinity;
  for (let c = Math.min(from, to) + 1; c < Math.max(from, to); c++) {
    for (let r = 0; r < grid.rows.length; r++) {
      if (table[r]?.[c]) continue;
      const away = (grid.cols[c].centre - centre.x) ** 2 + (grid.rows[r].centre - centre.y) ** 2;
      if (away < far) { far = away; best = { column: c, row: r }; }
    }
  }
  return best;
}
