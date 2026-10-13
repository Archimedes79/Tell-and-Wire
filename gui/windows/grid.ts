// The grid a gui is laid out on, in pixels: what the frontend draws it with (`frontend/deployment/gui/kit/layout.ts`) and what a
// window tells a drawing function of the room it has (`gui/notebook/windows.ts`).

/** Cells across the gui. Square, so `w` and `h` are one unit, not two. */
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
 */
export const GUI_GAP = 14;

/** What a window keeps of its width for its own padding and border, on each side, in pixels: its cells are what is left. */
export const WINDOW_PADDING = 12;
export const WINDOW_BORDER = 1;

/**
 * What a block's card keeps of its size around what it shows, in pixels: its padding (10 down, 14 across, each side), a border and the
 * line that names it (`frontend/deployment/gui/surface/GuiSurface.tsx`). What is drawn in a block has the rest.
 */
export const BLOCK_CHROME = { width: 30, height: 42 };
