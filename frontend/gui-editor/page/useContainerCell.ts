import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cellSize, GUI_MAX_CELL, GUI_NARROW } from '../../app/document/layout';

/**
 * The current square-cell size for whatever element this ref is on.
 *
 * The cell is `contentWidth / 16`, capped — so the same page renders identically
 * in the editor panel, the runtime window and a deployed bundle, only smaller.
 * That needs the real width, which only the browser knows, hence the observer.
 *
 * One hook for both surfaces: the designer and the runtime window must never
 * disagree about how big a cell is, or designing would stop predicting running.
 *
 * *narrow* is the window's, not the grid's: a page is one column on a phone,
 * and not in a designer whose grid is narrow only because the palette and the
 * panel stand beside it.
 */
const PHONE = typeof matchMedia === 'undefined' ? null : matchMedia(`(max-width: ${GUI_NARROW - 1}px)`);
export function useContainerCell() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [cell, setCell] = useState(GUI_MAX_CELL);
  const [narrow, setNarrow] = useState(PHONE?.matches ?? false);

  useEffect(() => {
    if (!PHONE) return;
    const update = () => setNarrow(PHONE.matches);
    PHONE.addEventListener('change', update);
    return () => PHONE.removeEventListener('change', update);
  }, []);

  // Before the first paint: drawn at the capped width first, a phone flashed the sixteen columns.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => setCell(cellSize(node.clientWidth));
    update();
    // ResizeObserver rather than a window listener: the panel resizes when the
    // node is resized or a sidebar opens, without the window changing at all.
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, cell, narrow };
}
