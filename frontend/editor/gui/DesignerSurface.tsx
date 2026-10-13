import React from 'react';
import { Trash2 } from 'lucide-react';
import type { GuiWidget } from '../document/graph';
import { WIDGET_BUILDERS } from '../document/elements/registry';
import { blockValue, GuiBlock, GuiGrid } from '../../deployment/gui/surface/GuiSurface';
import { heldValue, roundGoing, useSession } from '../../deployment/gui/kit/api/session';
import { moveBlock, patchBlock } from './guiWrite';
import { cellsFromDrag, resolveWidgetLayout, GUI_GRID_COLUMNS, GUI_MAX_CELL } from '../../deployment/gui/kit/layout';
import QuickInsert from './QuickInsert';
import type { PaletteEntry } from './DesignerPalette';
import { blockCan, widgetValueIsDesign } from '../document/model/gui';
import Button from '../../deployment/gui/kit/ui/Button';
import { ACCENT, DIMMER, LINE, MUTED, WARNING_TEXT } from '../../deployment/gui/kit/ui/theme';

/**
 * The GUI, plus the few affordances needed to build one.
 *
 * Everything a *user* sees comes from `GuiSurface.tsx` — the same grid, the same
 * blocks, the same widgets the deployed tool renders. What is added here is
 * only what a builder needs, and it is modelled on a document editor rather
 * than a layout tool, because a document is what a GUI is:
 *
 *  - **words are typed where they stand.** A heading is edited by clicking it
 *    and typing, not by selecting it and finding a box in a side panel;
 *  - **`/` inserts.** Type what you want, Enter, carry on;
 *  - **a block is moved by its grip and sized by its corner**, to any cell of the
 *    grid; the bin beside the selected block removes it. There is no second
 *    way to set a width: with a grid, dragging is the simple one.
 *
 * None of it is reachable from the deployed tool's entry point, which is the
 * whole point of the split (see the note at the top of GuiSurface.tsx).
 *
 * The blocks stay **live** while you design: you can type into a field and
 * press ▶ and watch the same blocks fill, because designing and using are the
 * same gui.
 */
export default function DesignerSurface({
  widgets, onWidgetValue, onWidgetTrigger, selectedId, onSelect, onRemove, overrides, dropIndex,
  insertAt, onInsertAt, onInsert,
}: {
  widgets: GuiWidget[];
  onWidgetValue: (widget: GuiWidget, value: unknown) => void;
  /** A block was used: the same event the delivered GUI gets, because the blocks here are live. */
  onWidgetTrigger: (widget: GuiWidget, value?: unknown) => void;
  selectedId: string | null;
  onSelect: (widgetId: string | null) => void;
  onRemove: (widgetId: string) => void;
  overrides?: Record<string, string>;
  /** Where a palette drag in flight would land. */
  dropIndex?: number | null;
  /** Where the `/` menu is open, as an index into the GUI; null when it is not. */
  insertAt: number | null;
  onInsertAt: (index: number | null) => void;
  onInsert: (entry: PaletteEntry, index: number) => void;
}) {
  // What the blocks show is what the rounds of the session handed the end
  // points they show -- whoever started them: this tab, the App tab, the clock.
  // Only what the blocks show: a tick of a round draws no block again.
  const view = useSession((s) => s.view);
  const edits = useSession((s) => s.edits);
  const busy = useSession(roundGoing);
  // Reported by the grid below, because only the grid element knows it.
  const [cell, setCell] = React.useState(GUI_MAX_CELL);
  const placements = resolveWidgetLayout(widgets);

  // Every change goes through `guiWrite`, which reads the GUI from the store
  // when the change lands: what this render drew may be a keystroke old.

  // ---- reorder by dragging ---------------------------------------------------
  //
  // Pointer events, not HTML5 drag-and-drop. That API looks made for this and is
  // not: a `dragstart` inside a block full of live inputs is swallowed as often
  // as it fires, there is no drag image worth having, and none of it can be
  // tested without a real mouse. Tracking the pointer is a dozen lines, works
  // every time, reorders *live* so you see the result while you move — and is
  // what ReactFlow does on the canvas next door.
  const blockRefs = React.useRef(new Map<string, HTMLElement>());
  const dragging = React.useRef<string | null>(null);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  // The block the pointer is over: its grip shows, beside it, and only then.
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);


  // ---- resize: the one thing the grid is still dragged for --------------------
  const resize = React.useRef<{ id: string; x: number; y: number; w: number; h: number } | null>(null);

  React.useEffect(() => {
    const onUp = () => {
      dragging.current = null;
      resize.current = null;
      setDraggingId(null);
    };
    const onMove = (event: MouseEvent) => {
      // The button was let go outside the window, where no mouseup is heard.
      if (event.buttons === 0 && (dragging.current || resize.current)) {
        onUp();
        return;
      }
      const held = dragging.current;
      if (held) {
        const from = blockRefs.current.get(held)?.getBoundingClientRect();
        for (const [id, element] of blockRefs.current) {
          if (id === held || !from) continue;
          const box = element.getBoundingClientRect();
          if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) continue;
          // Moved past a block only once the pointer is beyond its middle, in the way it moves: a taller block
          // under the pointer would otherwise swap back and forth with every pixel.
          const below = box.top >= from.bottom - 1;
          const above = box.bottom <= from.top + 1;
          const forward = below || (!above && box.left > from.left);
          const middle = below || above ? (box.top + box.bottom) / 2 : (box.left + box.right) / 2;
          const pointer = below || above ? event.clientY : event.clientX;
          if (forward ? pointer > middle : pointer < middle) moveBlock(held, id);
          return;
        }
        return;
      }
      const state = resize.current;
      if (!state) return;
      patchBlock(state.id, {
        w: Math.max(1, Math.min(GUI_GRID_COLUMNS, state.w + cellsFromDrag(event.clientX - state.x, cell))),
        h: Math.max(1, state.h + cellsFromDrag(event.clientY - state.y, cell)),
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  });

  return (
    <div onMouseDown={() => onSelect(null)}>
      {/* An empty gui is still a GUI: without a minimum height the grid is
          zero pixels tall and there is nothing to aim a first element at. */}
      <GuiGrid minRows={4} onCell={setCell}>
        {placements.map((placement, index) => {
          const { widget } = placement;
          const incoming = view?.shown[widget.id];
          const fires = !!widget.fires && blockCan(widget).fires;
          // A block's design is what it holds here; a conversation is the session's.
          const own = widgetValueIsDesign(widget) ? widget.value : heldValue({ view, edits }, widget.id, widget.value);
          const selected = widget.id === selectedId;
          const gripShown = selected || hoveredId === widget.id || draggingId === widget.id;
          // A block that is its own words is typed where it stands: the kind says how.
          const InPlace = selected ? WIDGET_BUILDERS[widget.kind]?.InlineEditor : undefined;

          return (
            <React.Fragment key={widget.id}>
              {dropIndex === index && <InsertionLine />}
              {insertAt === index && (
                <QuickInsert onPick={(entry) => onInsert(entry, index)} onClose={() => onInsertAt(null)} />
              )}
              <GuiBlock
                placement={placement}
                incoming={incoming}
                value={blockValue(widget, own, incoming, overrides)}
                onChange={(next) => onWidgetValue(widget, next)}
                onTrigger={(next) => onWidgetTrigger(widget, next)}
                fires={fires}
                busy={busy}
                blockRef={(element) => {
                  if (element) blockRefs.current.set(widget.id, element);
                  else blockRefs.current.delete(widget.id);
                }}
                // Selected, a block waiting for what it shows has its whole height: it is the one being sized.
                keepRoom={selected}
                // The bin and the grip stand beside the block, outside its box.
                style={{
                  // Not selected: the GUI's focus ring shows where the keyboard is.
                  outline: selected ? `2px solid ${ACCENT}` : undefined,
                  outlineOffset: 1,
                  opacity: draggingId === widget.id ? 0.55 : 1,
                  overflow: gripShown ? 'visible' : undefined,
                  zIndex: selected ? 5 : gripShown ? 4 : undefined,
                }}
                frame={{
                  onMouseEnter: () => setHoveredId(widget.id),
                  onMouseLeave: () => setHoveredId((now) => (now === widget.id ? null : now)),
                  onMouseDown: (e) => { e.stopPropagation(); onSelect(widget.id); },
                  // Enter or Space on the block itself, not on a field in it, selects it.
                  onKeyDown: (e) => {
                    if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
                    e.preventDefault();
                    onSelect(widget.id);
                  },
                  tabIndex: 0,
                  role: 'group',
                  'aria-label': widget.label || widget.kind,
                }}
                content={InPlace ? (
                  <InPlace
                    widget={widget}
                    cell={cell}
                    rows={placement.h}
                    onText={(value) => patchBlock(widget.id, { value })}
                    onRows={(h) => patchBlock(widget.id, { h })}
                  />
                ) : undefined}
              >
                {selected && <DeleteButton onRemove={() => onRemove(widget.id)} />}

                {/* The grip, not the block, starts a drag — so the widget stays
                    live and you can type in it while designing. A full-height
                    strip rather than a 14px dot: a grip you have to aim for is
                    not a grip. It stands in the gap beside the block, where it
                    covers nothing, and only while the pointer is on the block. */}
                <div
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelect(widget.id);
                    dragging.current = widget.id;
                    setDraggingId(widget.id);
                  }}
                  title="Drag to move"
                  className="absolute select-none flex items-center justify-center"
                  style={{
                    left: -15, top: 0, bottom: 0, width: 14, color: MUTED, fontSize: 12,
                    cursor: draggingId === widget.id ? 'grabbing' : 'grab',
                    opacity: gripShown ? 0.9 : 0,
                    pointerEvents: gripShown ? undefined : 'none',
                  }}
                >
                  ⠿
                </div>

                {/* Which blocks *start* the tool, seen without opening any of
                    them. A GUI is mostly fields that are sent when something
                    else starts a round; the one or two that start it are the
                    whole shape of how the tool is used, and they were
                    indistinguishable until you selected each block in turn.
                    Builder's chrome: the delivered GUI draws no badge. */}
                {fires && (
                  <span
                    className="absolute select-none pointer-events-none"
                    style={{ right: 3, top: 2, fontSize: 10, color: WARNING_TEXT }}
                    title={`Using this block fires "${widget.fires}"`}
                    aria-hidden="true"
                  >
                    ⚡
                  </span>
                )}

                <div
                  className="absolute"
                  style={{
                    right: 0, bottom: 0, width: 12, height: 12, background: ACCENT, cursor: 'nwse-resize',
                    opacity: selected ? 1 : 0, borderRadius: '3px 0 6px 0',
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSelect(widget.id);
                    resize.current = { id: widget.id, x: e.clientX, y: e.clientY, w: placement.w, h: placement.h };
                  }}
                  title="Drag to any size"
                />
              </GuiBlock>
            </React.Fragment>
          );
        })}
        {dropIndex != null && dropIndex >= placements.length && <InsertionLine />}
        {insertAt != null && insertAt >= placements.length && (
          <QuickInsert onPick={(entry) => onInsert(entry, placements.length)} onClose={() => onInsertAt(null)} />
        )}
        {insertAt == null && (
          <button
            type="button"
            className="rounded-lg text-sm text-left px-3"
            style={{ gridColumn: 'span 16', height: 36, color: DIMMER, border: `1px dashed ${LINE}`, background: 'transparent' }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => onInsertAt(placements.length)}
          >
            ＋ Add a block — or press <kbd>/</kbd>
          </button>
        )}
      </GuiGrid>
    </div>
  );
}

/**
 * Where a dragged element would land.
 *
 * A grid item of its own, so it sits exactly where the dropped element will —
 * a line drawn over the GUI would have to re-derive the same position and
 * could disagree with it.
 */
function InsertionLine() {
  return <div style={{ gridColumn: 'span 16', height: 2, background: ACCENT, borderRadius: 2 }} />;
}

/**
 * What you do to a block, on the block: the bin. Everything else has a way of its own -- the grip
 * moves it (Ctrl+↑↓ too), the corner sizes it to any cell, `/` adds a neighbour -- so there is no
 * second way to set a width. It stands beside the block, on the right, where the grip stands on the
 * left: above it, over the first block, it was cut off by the page's edge.
 */
function DeleteButton({ onRemove }: { onRemove: () => void }) {
  return (
    <div
      className="absolute select-none"
      style={{ right: -34, top: 0, zIndex: 20 }}
      onMouseDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
    >
      <Button variant="danger" size="sm" title="Delete block (Del)" aria-label="Delete block" onClick={onRemove}>
        <Trash2 size={14} aria-hidden="true" />
      </Button>
    </div>
  );
}
