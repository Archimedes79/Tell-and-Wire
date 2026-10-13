// How large a block of the GUI is, in cells and in pixels.
//
// Here, in the neutral folder, because two ends ask: the page that draws the
// grid (`frontend/deployment/gui/kit/layout.ts`) and a run that tells a body
// the room its result has (`windows.ts`).

/** Cells across the GUI. Square, so `w` and `h` are one unit, not two. */
export const GUI_GRID_COLUMNS = 16;

/**
 * The widest a cell is allowed to get.
 *
 * Without a cap, a square cell on a 4K monitor would be ~250px and every block
 * would inflate with the window. A capped cell means the GUI has a maximum
 * width and centres, with margins growing instead -- a printed page, and the
 * reason a text column stays readable.
 */
export const GUI_MAX_CELL = 56;

/**
 * The gap between blocks, in pixels. One value, everywhere.
 *
 * Equal in both directions on purpose: the cell is square, and a row gap that
 * differed from the column gap would quietly make a 4x4 block non-square.
 * Where a *section* should end, the `spacer` block is for that, not a bigger
 * uniform gap.
 */
export const GUI_GAP = 14;

/** Cells a block occupies when it has none of its own yet. */
export const DEFAULT_WIDGET_SPAN = { w: 8, h: 4 };

/** A block's size as its cells: columns spanned, 1..GUI_GRID_COLUMNS, and rows, at least 1. */
export function cellsOf(block: { w?: number; h?: number }): { w: number; h: number } {
  return {
    w: Math.min(GUI_GRID_COLUMNS, Math.max(1, Math.round(block.w ?? DEFAULT_WIDGET_SPAN.w))),
    h: Math.max(1, Math.round(block.h ?? DEFAULT_WIDGET_SPAN.h)),
  };
}

/**
 * A block's size on a GUI at its full width, in pixels -- its cells and the
 * gaps between them -- and the cells it spans. The GUI never needs the sum,
 * since the browser's grid does it; a node wired into the end point the
 * block shows does, to write -- or at run time to draw -- what it sends for the
 * room there is (`editor/graph/writing/generationContext.ts`, `windows.ts`). On
 * a narrower gui every cell shrinks alike (`cellSize`), so this is the most the
 * block gets.
 */
export function blockSize(block: { w?: number; h?: number }): { w: number; h: number; width: number; height: number } {
  const { w, h } = cellsOf(block);
  const pixels = (cells: number) => cells * GUI_MAX_CELL + (cells - 1) * GUI_GAP;
  return { w, h, width: pixels(w), height: pixels(h) };
}
