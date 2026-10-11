import { useEffect, useRef, useState } from 'react';
import type { GraphNode, GuiWidget, WidgetKind } from '../document/graph';
import { useGraphNodes, useGraphStore } from '../document/store/graphStore';
import DesignerSurface from './DesignerSurface';
import DesignerPalette, { newBlock, type PaletteEntry } from './DesignerPalette';
import { useRound } from '../../deployment/gui/surface/useRound';
import RequirementsDialog from '../../deployment/gui/kit/dialogs/RequirementsDialog';
import { roundGoing, setEdit, useSession } from '../../deployment/gui/kit/api/session';
import { blockCan, widgetTakesValue, widgetValueIsDesign } from '../document/model/gui';
import { addBlocks, insertBlock, moveBlock, patchBlock, removeBlock } from './guiWrite';
import { guiFromGraph } from './guiFromGraph';
import { useDialogs } from '../app/dialogs/useDialogs';
import { liveTypedValues } from './typedValues';
import GuiHeading from './GuiHeading';
import WidgetEditor from './WidgetEditor';
import GuiSettings from './GuiSettings';
import { schemeVars } from '../../deployment/gui/kit/ui/scheme';
import { ACCENT, LINE, SUNKEN, SURFACE, TEXT } from '../../deployment/gui/kit/ui/theme';

/**
 * The graph's gui, built on the gui itself. One graph, one tool, one gui --
 * a bundle's recipient wants a window, not three.
 */
export default function DesignerTab() {
  const metadata = useGraphStore((s) => s.metadata);
  const setMetadata = useGraphStore((s) => s.setMetadata);
  const widgets = useGraphStore((s) => s.gui);
  // Its blocks are live, and a round they start is the delivered tool's: the
  // document is handed over, what the graph still needs is asked first, and
  // the round is sent what this gui shows -- its design, set here.
  const round = useRound(
    () => useGraphStore.getState().holdDocument(),
    () => Object.fromEntries(useGraphStore.getState().gui
      .filter((widget) => widgetTakesValue(widget) && widgetValueIsDesign(widget) && widget.value !== undefined)
      .map((widget) => [widget.id, widget.value])),
  );
  const busy = useSession(roundGoing);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // What was typed into a live block, shown in place of what arrived there --
  // for as long as the block still holds it. A run that sent it, or a panel
  // edit that replaced it, ends it (`liveTypedValues`). The value itself is
  // stored as it is typed; this only decides which of the two a block shows.
  const [typed, setTyped] = useState<Record<string, string>>({});
  const overrides = liveTypedValues(typed, widgets);

  const selected = widgets.find((widget) => widget.id === selectedId) ?? null;

  // What the graph's start and end points still lack on the gui, and the
  // question of the ones a call starts.
  const nodes = useGraphNodes();
  const edges = useGraphStore((s) => s.rfEdges);
  const lacking = guiFromGraph(nodes, edges, widgets);
  const dialogs = useDialogs();

  /**
   * Draw the gui's missing blocks from the graph. A start point a call starts
   * is put on the gui only when the person says so, one at a time: the gui
   * can only start one the gui starts, and switched it no longer serves a call.
   */
  const generate = async () => {
    const added = lacking.now.flatMap((made) => made.blocks);
    const switched: GraphNode[] = [];
    for (const made of lacking.ifSwitched) {
      const name = made.point.label || made.point.id;
      const answer = await dialogs.ask<'switch'>({
        title: `Start “${name}” from the gui?`,
        text: `A call starts “${name}” now: a script, the command line, or a model. The gui can only start a start point the gui starts, so `
          + 'switched, it serves the gui and no longer a call. Cancel leaves it as it is, and makes no block for it.',
        answers: [{ value: 'switch', label: 'Switch it to the gui', variant: 'primary' }],
      });
      if (answer !== 'switch') continue;
      switched.push(made.point);
      added.push(...made.blocks);
    }
    if (!added.length) return;
    addBlocks(added, switched);
    setSelectedId(added[0].id);
  };

  // Every change to the gui goes through `guiWrite`, which reads it from the
  // store when the change lands: a block's editor may hand its change on long
  // after it was drawn.

  /** Add a block to the gui, where it was asked for -- at the end by default. */
  const addWidget = (kind: WidgetKind, mode?: string, at?: number) => {
    const widget = newBlock(kind, mode, widgets);
    insertBlock(widget, at);
    setSelectedId(widget.id);
  };
  // The drop below is wired once per drag, and must add to the gui as it is
  // when the mouse comes up, not as it was when the drag began.
  const addWidgetNow = useRef(addWidget);
  addWidgetNow.current = addWidget;

  /** Where the `/` menu is open, as a place in the gui order. */
  const [insertAt, setInsertAt] = useState<number | null>(null);

  /**
   * Dragging a new element out of the palette and onto the gui.
   *
   * Pointer events rather than HTML5 drag-and-drop, for the same reason the
   * reorder uses them: this way it works inside live inputs, it can be tested,
   * and the element lands **where you let go** instead of always at the end.
   *
   * The drop target is the whole gui column, not the grid: the grid is only as
   * tall as its contents, which on an empty gui is zero pixels.
   */
  const [dragEntry, setDragEntry] = useState<PaletteEntry | null>(null);
  const [dragPoint, setDragPoint] = useState<{ x: number; y: number } | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  /** Where in the gui order a release at this point would land. */
  const indexAt = (event: MouseEvent): number | null => {
    const zone = document.querySelector('[data-gui-dropzone]');
    if (!zone) return null;
    const box = zone.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right
        || event.clientY < box.top || event.clientY > box.bottom) return null;
    // Only the blocks: the grid also holds the insertion line, the `/` menu and the add button.
    const children = [...zone.querySelectorAll('[data-gui-surface] > [data-block]')];
    for (let i = 0; i < children.length; i += 1) {
      const rect = children[i].getBoundingClientRect();
      // Before the first block whose middle is past the pointer: on a gui that
      // flows, "here" means "in front of the thing I am pointing above".
      if (event.clientY < rect.top + rect.height / 2) return i;
    }
    return children.length;
  };

  useEffect(() => {
    if (!dragEntry) return;
    const onMove = (event: MouseEvent) => {
      setDragPoint({ x: event.clientX, y: event.clientY });
      setDropIndex(indexAt(event));
    };
    const onUp = (event: MouseEvent) => {
      const index = indexAt(event);
      setDragEntry(null);
      setDragPoint(null);
      setDropIndex(null);
      if (index !== null) addWidgetNow.current(dragEntry.kind, dragEntry.mode, index);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragEntry, widgets.length]);

  const selectedIndex = widgets.findIndex((widget) => widget.id === selectedId);

  /** Move the selected block one place along the gui. */
  const moveSelected = (delta: -1 | 1) => {
    if (selected) moveBlock(selected.id, selectedIndex + delta);
  };

  const remove = (id: string) => {
    removeBlock(id);
    setSelectedId(null);
  };

  // `/` inserts, Delete removes the selected block, Ctrl+Arrow reorders it. Ignored while a
  // field has focus -- the blocks are live, so typing in a text block would
  // otherwise delete it mid-sentence.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (target?.isContentEditable) return;
      if (event.key === '/') {
        // After the block in hand, or at the end of the gui: where the next
        // thing would go if this were a document, which it is.
        event.preventDefault();
        setInsertAt(selectedIndex === -1 ? widgets.length : selectedIndex + 1);
        return;
      }
      if (!selectedId) return;
      if (event.key === 'Delete') {
        event.preventDefault();
        remove(selectedId);
      } else if (event.ctrlKey && event.key === 'ArrowUp') {
        event.preventDefault();
        moveSelected(-1);
      } else if (event.ctrlKey && event.key === 'ArrowDown') {
        event.preventDefault();
        moveSelected(1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  /**
   * A live edit in a block. What a block holds by design -- a choice, a text,
   * a path to start on -- is set here as the gui's design, as everything on
   * this tab is; a conversation is only ever the session's (`valueIsDesign`).
   * A block a round is given no value by -- a button -- keeps nothing.
   */
  const setWidgetValue = (widget: GuiWidget, value: unknown) => {
    if (!widgetTakesValue(widget)) return;
    if (!widgetValueIsDesign(widget)) {
      setEdit(widget.id, value);
      return;
    }
    // Only text is remembered as an edit in progress; a block that stores
    // something richer holds it itself and has no half-typed state to protect.
    if (typeof value === 'string') setTyped((prev) => ({ ...prev, [widget.id]: value }));
    // Through `guiWrite`, as every edit of the gui: a value and the event
    // that follows it arrive in the same tick.
    patchBlock(widget.id, { value });
  };

  /** A block was used: its value is kept first, and one that fires a start point starts a round there. */
  const fire = (widget: GuiWidget, value?: unknown) => {
    if (value !== undefined) setWidgetValue(widget, value);
    if (widget.fires && blockCan(widget).fires && !busy) void round.run(widget.fires, widget.id);
  };

  return (
    <div className="flex-1 flex overflow-hidden" style={{ background: SUNKEN }}>
      <DesignerPalette
        onAdd={addWidget}
        onDragStart={(entry) => setDragEntry(entry)}
        fromGraph={{ points: lacking.now.length + lacking.ifSwitched.length, onGenerate: () => void generate() }}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <GuiHeading name={metadata.name} description={metadata.description} onChange={setMetadata} />
        <div
          data-gui-dropzone
          className="flex-1 overflow-auto px-8 py-6"
          // The gui, in its own colour scheme: the editor around it keeps its own.
          style={{
            ...schemeVars(metadata.gui_scheme),
            background: SUNKEN,
            ...(dragEntry ? { outline: `2px dashed ${ACCENT}`, outlineOffset: -6 } : {}),
          }}
        >
          <DesignerSurface
            dropIndex={dragEntry ? dropIndex : null}
            widgets={widgets}
            onWidgetValue={setWidgetValue}
            onWidgetTrigger={fire}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onRemove={remove}
            overrides={overrides}
            insertAt={insertAt}
            onInsertAt={setInsertAt}
            onInsert={(entry, index) => { setInsertAt(null); addWidget(entry.kind, entry.mode, index); }}
          />
        </div>
      </div>

      {/* Always there, so the gui does not move when a block is selected: the
          block's settings -- or, with none, the gui's. */}
      <aside
        className="overflow-y-auto px-4 py-4"
        style={{ width: 300, background: SURFACE, borderLeft: `1px solid ${LINE}`, flexShrink: 0 }}
      >
        {selected
          ? <WidgetEditor widget={selected} onChange={(patch) => patchBlock(selected.id, patch)} />
          : <GuiSettings />}
      </aside>

      <RequirementsDialog requirements={round.requirements} onSubmit={round.submit} onCancel={round.cancel} />
      {dialogs.dialogs}

      {/* The element under the cursor while it is being dragged. Without it the
          only feedback was the result, which on a failed drop is no feedback. */}
      {dragEntry && dragPoint && (
        <div
          className="fixed pointer-events-none rounded-lg px-3 py-1.5 text-sm flex items-center gap-2"
          style={{
            left: dragPoint.x + 12, top: dragPoint.y + 12, zIndex: 60,
            background: SURFACE, border: `1px solid ${ACCENT}`, color: TEXT, opacity: 0.95,
          }}
        >
          <dragEntry.icon size={14} aria-hidden="true" />
          <span>{dragEntry.label}</span>
        </div>
      )}
    </div>
  );
}
