// What a window and the block in it keep of their room, in pixels: the numbers a window tells a drawing function of the room it has
// (`gui/notebook/windows.ts`) and what the delivered page draws it with (`frontend/deployment/windows/WindowsSurface.tsx`). The grid itself
// -- the cell, the gap -- is the GUI's (`gui/size.ts`).

/** What a window keeps of its width for its own padding and border, on each side, in pixels: its cells are what is left. */
export const WINDOW_PADDING = 12;
export const WINDOW_BORDER = 1;

/**
 * What a block's card keeps of its size around what it shows, in pixels: its padding (10 down, 14 across, each side), a border and the
 * line that names it (`frontend/deployment/gui/surface/GuiSurface.tsx`). What is drawn in a block has the rest.
 */
export const BLOCK_CHROME = { width: 30, height: 42 };
