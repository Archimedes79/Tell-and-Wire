import React from 'react';
import type { GuiWidget } from '../kit/guiWidget';
import { BLOCKS } from './blocks';
import { useContainerCell } from './useContainerCell';
import { blockStyle, gridStyle, resolveWidgetLayout, type WidgetPlacement } from '../kit/layout';
import { toneIsBare, toneStyle, type Tone } from '../kit/ui/tone';
import { DANGER, DANGER_FILL, DANGER_TEXT, DIM, MUTED, TEXT } from '../kit/ui/theme';
import RunResult, { type ShownOutput } from './RunResult';

/**
 * The GUI a graph shows: its blocks, in order, on one grid.
 *
 * **This module is the deployment boundary.** It holds what a *user* of the
 * finished tool sees and nothing else — no selection, no drag handle, no resize
 * corner. The designer's chrome lives in `DesignerSurface.tsx`, which imports
 * from here and which the deployed tool's entry point cannot reach.
 *
 * Editing affordances behind an `editing` flag would still ship: a flag that
 * is false at run time leaves dead code in the bundle, not absent code, and a
 * base class the tool extends ships them because the subclass references the
 * base. Only the import graph decides what ends up in a bundle, so the boundary
 * is a module boundary — `deployment/gui/boundary.test.ts` asserts that it stays one.
 *
 * It knows no graph and no store: whoever draws it hands it the GUI as
 * designed and what is in use -- the delivered tool from the runtime API, the
 * editor from its document and the same API -- and is told what was used.
 */

/** The GUI as it is drawn: what was designed, and what is in use. */
export interface GuiModel {
  name: string;
  description: string;
  /** The blocks, as designed. */
  blocks: GuiWidget[];
  /** What a block holds now: what was set, what the session keeps, or its design. */
  valueOf: (block: GuiWidget) => unknown;
  /** What a block shows of what the end point it shows handed back; undefined for nothing yet. */
  shownOn: (block: GuiWidget) => unknown;
  /** Using the block starts a round: it fires a start point the GUI starts. */
  fires: (block: GuiWidget) => boolean;
  /** A round the GUI starts is sent what the block holds, under its id. */
  takes: (block: GuiWidget) => boolean;
  /** A round is going: a block that starts one waits. */
  busy: boolean;
  /** Why the last round failed, in its own words; empty when it did not. */
  error: string;
  /** For a GUI without blocks: what the graph hands back, each output under its label. */
  outputs: ShownOutput[];
  /** The graph has no nodes at all: nothing to run, nothing to show. */
  empty?: boolean;
}

/**
 * What a block currently holds.
 *
 * `incoming` is what the end point it shows handed back; the widget's own
 * value is what it holds, including an edit still being typed. They are kept
 * apart so that a widget which both shows and accepts text does not overwrite
 * the reply the user is reading -- and so that what it shows as its value is
 * what a round sends from it: its own (`BlockKind.ownsValue`).
 */
export function blockValue(
  widget: GuiWidget,
  own: unknown,
  incoming: unknown,
  overrides?: Record<string, string>,
): unknown {
  const held = overrides?.[widget.id] ?? own ?? '';
  if (BLOCKS[widget.kind]?.ownsValue?.(widget)) return held;
  return incoming !== undefined && overrides?.[widget.id] === undefined ? incoming : held;
}

/** Whether the GUI is narrow (`GUI_NARROW`): set by the grid, read by each block. */
const NarrowGui = React.createContext(false);

/** The grid the GUI flows on: 16 square columns, capped at a readable width. */
export function GuiGrid({
  children, minRows, onCell,
}: {
  children: React.ReactNode;
  /** Keep this much height when empty, so there is a GUI to aim at. */
  minRows?: number;
  /**
   * The measured cell size, whenever it changes.
   *
   * Only the grid element knows it -- it comes from that element's own width --
   * so a caller that needs it (the resize drag, which converts pixels to cells)
   * is told by it.
   */
  onCell?: (cell: number) => void;
}) {
  const { ref, cell, narrow } = useContainerCell();

  React.useEffect(() => { onCell?.(cell); }, [cell, onCell]);

  return (
    <div
      ref={ref}
      data-gui-surface
      style={{
        ...gridStyle(cell, narrow),
        minHeight: minRows ? cell * minRows : undefined,
      }}
    >
      <NarrowGui.Provider value={narrow}>{children}</NarrowGui.Provider>
    </div>
  );
}

/**
 * One block: its place on the grid, its tone, its caption, and the widget.
 *
 * `children` is where the designer hangs its chrome. A deployed tool passes
 * none, and none of that code is in its bundle.
 */
export function GuiBlock({
  placement, value, incoming, onChange, onTrigger, fires, busy, style, frame, blockRef, keepRoom, children, content,
}: {
  placement: WidgetPlacement;
  value: unknown;
  incoming: unknown;
  onChange: (next: unknown) => void;
  onTrigger: (value?: unknown) => void;
  /** Using it starts a round: see `WidgetViewProps.fires`. */
  fires?: boolean;
  busy?: boolean;
  style?: React.CSSProperties;
  /** What the designer adds to the block's own box: selecting it by mouse and keyboard. */
  frame?: React.HTMLAttributes<HTMLDivElement>;
  blockRef?: (element: HTMLElement | null) => void;
  /** Stands at the height it is designed to even while it waits for something to show: the block being sized. Designer only. */
  keepRoom?: boolean;
  children?: React.ReactNode;
  /**
   * Drawn in place of the block's own widget. Designer only: it is how a
   * heading becomes a box you type in while it is selected. A deployed GUI
   * passes none, so nothing that edits can be reached from it.
   */
  content?: React.ReactNode;
}) {
  const { widget } = placement;
  const kind = BLOCKS[widget.kind];
  const View = kind?.View;
  // What the label above a block names, when the block is one control.
  const controlId = kind?.labelsControl ? `block-${widget.id}` : undefined;
  const caption = { className: 'text-xs font-medium flex-shrink-0', style: { color: MUTED } };
  const look = { border: widget.border, background: widget.background };
  const bare = toneIsBare(widget.tone as Tone, look);
  const waiting = !keepRoom && kind?.waits?.(widget, value) === true;
  const narrow = React.useContext(NarrowGui);
  // A heading or a rule without a box is as tall as what is in it and stands in the middle of its row (BlockKind.sits), not
  // stretched over cells it does not fill -- selected as well: it is the row that is sized, not the words.
  const sits = !bare ? undefined : kind?.sits?.(widget);

  return (
    <div
      ref={blockRef}
      data-block
      className="relative rounded-xl flex flex-col gap-1 min-w-0 overflow-hidden"
      style={{
        ...blockStyle(placement, waiting, narrow),
        ...toneStyle(widget.tone as Tone, look),
        alignSelf: sits,
        // A box's edge and a bare block's edge are the same line -- a field, a heading and a card start at one left margin, which
        // is the one thing a document must get right; what is in a box is set in from it.
        padding: bare ? '2px 0' : '10px 14px',
        ...style,
      }}
      {...frame}
    >
      {children}

      {/* A button is its own caption; in a row with fields it stands level with them, not with their captions. */}
      {bare && kind?.drawsLabel && <span aria-hidden="true" className="text-xs flex-shrink-0">&nbsp;</span>}

      {/* Over a plain block too: a chart or a reply without a frame still says what it is. */}
      {widget.label && !kind?.drawsLabel && (controlId
        ? <label htmlFor={controlId} {...caption}>{widget.label}</label>
        : <span {...caption}>{widget.label}</span>)}

      <div className="flex-1 min-h-0">
        {content ?? (View ? (
          <View widget={widget} value={value} incoming={incoming} onChange={onChange} onTrigger={onTrigger} fires={fires} busy={busy} controlId={controlId} />
        ) : (
          <span className="text-xs" style={{ color: DANGER }}>Unknown kind of block: {widget.kind}</span>
        ))}
      </div>
    </div>
  );
}

/**
 * What a tool shows when its GUI has no blocks: what it does, how to start
 * it, and what its run handed back -- each output under its name.
 */
function WithoutGui({ gui }: { gui: GuiModel }) {
  // A graph of nothing is not ready to run.
  if (gui.empty) {
    return (
      <div className="m-6 max-w-2xl">
        <p className="text-sm mb-2" style={{ color: TEXT }}>This graph has no nodes yet.</p>
        <p className="text-xs" style={{ color: DIM }}>
          Add one from the palette on the Graph tab, or a block on the GUI tab.
        </p>
      </div>
    );
  }
  return (
    <div className="m-6 max-w-2xl">
      <p className="text-sm mb-2" style={{ color: TEXT }}>
        {gui.description || `${gui.name} is ready to run.`}
      </p>
      <p className="text-xs" style={{ color: DIM }}>
        It runs when it is started -- by itself, or by a call -- and what it hands back appears here.
      </p>
      <RunResult outputs={gui.outputs} />
    </div>
  );
}

/**
 * Why the last round failed, in the round's own words -- which can be several
 * lines long, and belong above the GUI rather than squeezed into the header
 * beside its "❌ Failed". Part of what the GUI shows, so every host draws it.
 */
function RunError({ error }: { error: string }) {
  if (!error) return null;
  return (
    <div
      className="mx-6 mt-4 text-sm rounded-lg px-4 py-3 whitespace-pre-wrap"
      style={{ background: DANGER_FILL, border: `1px solid ${DANGER}`, color: DANGER_TEXT }}
    >
      {error}
    </div>
  );
}

/**
 * The GUI in use: what a deployed tool serves, and what the editor's running
 * application shows -- or, with no blocks, the tool without a GUI. One
 * component, so what is tried in the editor cannot flatter.
 *
 * A block used is *onValue* -- what it now holds, for a block a round is
 * sent the value of -- and, for a block that fires a start point, *onEvent*,
 * once its value is in. A button is an event and nothing else: it holds no
 * value a round could be sent (`WidgetDefinition.takesValue`).
 */
export function GuiSurface({ gui, onValue, onEvent }: {
  gui: GuiModel;
  onValue: (block: GuiWidget, value: unknown) => void;
  onEvent: (block: GuiWidget) => void;
}) {
  if (gui.blocks.length === 0) return <><RunError error={gui.error} /><WithoutGui gui={gui} /></>;
  const keep = (block: GuiWidget, value: unknown) => {
    if (value !== undefined && gui.takes(block)) onValue(block, value);
  };
  // A block used: what it holds now is kept first -- the value and the event
  // that follows it arrive in the same tick -- and only a block that fires a
  // start point starts a round, and not while one is going.
  const fire = (block: GuiWidget, value?: unknown) => {
    keep(block, value);
    if (gui.fires(block) && !gui.busy) onEvent(block);
  };
  return (
    <>
      <RunError error={gui.error} />
      <div className="flex-1 overflow-auto px-8 py-6">
        <GuiGrid>
          {resolveWidgetLayout(gui.blocks).map((placement) => {
            const { widget } = placement;
            const incoming = gui.shownOn(widget);
            return (
              <GuiBlock
                key={widget.id}
                placement={placement}
                incoming={incoming}
                value={blockValue(widget, gui.valueOf(widget), incoming)}
                onChange={(next) => keep(widget, next)}
                onTrigger={(next) => fire(widget, next)}
                fires={gui.fires(widget)}
                busy={gui.busy}
              />
            );
          })}
        </GuiGrid>
      </div>
    </>
  );
}
