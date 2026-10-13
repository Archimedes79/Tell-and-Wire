import React from 'react';
import type { GuiWidget } from '../gui/kit/guiWidget';
import { GuiBlock, blockValue, type GuiModel } from '../gui/surface/GuiSurface';
import { useContainerCell } from '../gui/surface/useContainerCell';
import { GUI_GAP, GUI_GRID_COLUMNS, gridStyle, resolveWidgetLayout } from '../gui/kit/layout';
import { WINDOW_BORDER, WINDOW_PADDING } from '../../../gui/windows/grid.ts';
import { LINE, MUTED, SUCCESS_FILL, SUCCESS_TEXT, SURFACE, TEXT, WARNING_FILL, WARNING_TEXT, ACCENT_FILL, ACCENT_TEXT, DANGER, DANGER_FILL, DANGER_TEXT, WARNING } from '../gui/kit/ui/theme';
import { pageNotes, pageWindows, type PageNote, type PageWindow, type WindowBlock } from './windowsInUse';

/** Where a window stands: what a person sees of it before reading its result. */
export type WindowState = 'ready' | 'running' | 'waiting' | 'current' | 'stale' | 'failed' | 'empty';

const STATE_WORDS: Record<WindowState, string> = {
  ready: 'Ready', running: 'Running', waiting: 'Waiting', current: 'Done', stale: 'Out of date', failed: 'Failed', empty: 'Nothing to do',
};

/**
 * The pixels a button needs for its label: a window whose cells are so small that a button of its cells is narrower is stacked, one
 * block under the other, as a whole page is on a phone ("Summarize all" was cut off in 36 px).
 */
const needsPixels = (label: string): number => Math.ceil(label.length * 7 + 28);

/** The block that runs a window and is nothing else: its button (a window started by a change of an input has none). */
const isRun = (window: PageWindow, block: GuiWidget): boolean => block.id === window.starter && !(block as WindowBlock).sends_to?.length;

/** Whether a window's buttons, at the width its cells give them, are too narrow for their labels. */
export function cramped(window: PageWindow, cell: number): boolean {
  return resolveWidgetLayout(window.blocks).some(({ widget, w }) => isRun(window, widget) && w * cell + (w - 1) * GUI_GAP < needsPixels(widget.label ?? ''));
}

/** What an editor hangs on the page without the page knowing what it is: nothing, in a delivered tool. */
export interface Decoration {
  /** Added to a window's frame. */
  window?: (window: PageWindow) => { style?: React.CSSProperties; children?: React.ReactNode };
  /** Added to a block's own box (`GuiBlock`'s `frame` and `children`). */
  block?: (block: WindowBlock, window: PageWindow) => { frame?: React.HTMLAttributes<HTMLDivElement>; children?: React.ReactNode } | undefined;
}

/**
 * The page of windows a tool made of them shows: each window a framed, fixed-size part of the gui,
 * its blocks drawn by the same `GuiBlock` as every gui's.
 *
 * **A window does not grow.** Its cells are square, as the page's are, so a window is as tall as its
 * rows say whatever its blocks hold: a block that has nothing to show yet keeps its room
 * (`keepRoom`), and one with more than fits scrolls inside itself.
 *
 * It knows no editor. An editor draws chrome on it through *decorate*, and says a size for the cell
 * when it has less room than a page (*cell*); without one the cell is the page's own.
 */
export function WindowsSurface({ gui, onValue, onEvent, states, problems, cell: fixedCell, decorate, only }: {
  gui: GuiModel;
  onValue: (block: GuiWidget, value: unknown) => void;
  onEvent: (block: GuiWidget) => void;
  /** Where each window stands, by id; a window not named is ready. */
  states?: Readonly<Record<string, WindowState>>;
  /** Why a window came to nothing, by id, said in the place of its first result (the window does not grow). */
  problems?: Readonly<Record<string, { state: 'failed' | 'empty'; message: string }>>;
  /** A cell of this many pixels, in place of one a sixteenth of the page. */
  cell?: number;
  decorate?: Decoration;
  /** Draw only the window of this id, on a page as wide as it is: an editor that opens one beside its cells. */
  only?: string;
}) {
  const measured = useContainerCell();
  const cell = fixedCell ?? measured.cell;
  const narrow = fixedCell === undefined && measured.narrow;
  const windows = pageWindows(gui.blocks).filter((window) => only === undefined || window.id === only);
  // A page of one window is as many cells wide as the window is, so it is as large as the cell lets it be.
  // The words of the page and the windows, in the order the page was written; a tool whose page has no words is its windows.
  const notes = only === undefined ? pageNotes(gui.blocks) : [];
  const items = [
    ...windows.map((window, order) => ({ at: window.at ?? order, window })),
    ...notes.map((note) => ({ at: note.at, note })),
  ].sort((a, b) => a.at - b.at);
  const columns = only !== undefined && windows[0] ? windows[0].span : GUI_GRID_COLUMNS;

  const keep = (block: GuiWidget, value: unknown) => {
    if (value !== undefined && gui.takes(block)) onValue(block, value);
  };
  const fire = (block: GuiWidget, value?: unknown) => {
    keep(block, value);
    if (gui.fires(block) && !gui.busy) onEvent(block);
  };

  const page: React.CSSProperties = fixedCell === undefined
    ? gridStyle(cell, narrow)
    : { ...gridStyle(cell), gridTemplateColumns: `repeat(${columns}, 1fr)`, width: columns * cell + (columns - 1) * GUI_GAP, maxWidth: 'none', margin: 0 };

  return (
    <div className="flex-1 overflow-auto px-8 py-6">
      <div ref={measured.ref} data-windows-page style={{ ...page, alignItems: 'start' }}>
        {items.map((item) => {
          if ('note' in item) return <Note key={item.note.id} note={item.note} />;
          const { window } = item;
          // A window is as wide as its cells make it, not as the page is: on a tablet two side by side have cells too small for a button.
          const compact = narrow || (fixedCell === undefined && cramped(window, cell));
          const state = states?.[window.id] ?? 'ready';
          const problem = problems?.[window.id]?.state === state ? problems[window.id] : undefined;
          // The first thing the window shows is where it says what went wrong: in the place of its result, as the notebook does.
          const firstShown = problem ? window.blocks.find((one) => (one as WindowBlock).shows)?.id : undefined;
          const extra = decorate?.window?.(window);
          return (
            <section
              key={window.id}
              data-window={window.id}
              aria-label={window.title}
              style={{
                gridColumn: `span ${compact ? columns : window.span}`,
                position: 'relative', boxSizing: 'border-box', minWidth: 0,
                padding: WINDOW_PADDING, borderRadius: 16, border: `${WINDOW_BORDER}px solid ${LINE}`, background: SURFACE,
                ...extra?.style,
              }}
            >
              <StateChip state={state} />
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: compact ? '1fr' : `repeat(${window.span}, minmax(0, 1fr))`,
                  gridAutoRows: `${compact ? 'minmax(28px, auto)' : `${cell}px`}`,
                  gap: GUI_GAP,
                }}
              >
                {resolveWidgetLayout(window.blocks).map((placement) => {
                  const block = placement.widget as WindowBlock;
                  const incoming = gui.shownOn(block);
                  const decorated = decorate?.block?.(block, window);
                  return (
                    <GuiBlock
                      key={block.id}
                      placement={placement}
                      incoming={incoming}
                      value={blockValue(block, gui.valueOf(block), incoming)}
                      onChange={(next) => keep(block, next)}
                      onTrigger={(next) => fire(block, next)}
                      fires={gui.fires(block)}
                      busy={gui.busy}
                      keepRoom
                      style={compact
                        ? { gridColumn: '1 / -1', ...(placement.w <= 1 ? { display: 'none' } : {}), ...(!narrow && isRun(window, block) ? { justifySelf: 'start', minWidth: 'max-content' } : {}) }
                        // A button stands on a row of its own, as wide as its cells: an output of half the window that follows it must not be packed beside it.
                        : isRun(window, block) ? { gridColumn: '1 / -1', justifySelf: 'start', width: placement.w * cell + (placement.w - 1) * GUI_GAP } : undefined}
                      frame={decorated?.frame}
                    >
                      {block.id === firstShown && problem && <Problem problem={problem} />}
                      {decorated?.children}
                    </GuiBlock>
                  );
                })}
              </div>
              {extra?.children}
            </section>
          );
        })}
      </div>
    </div>
  );
}

/** What went wrong in a window, over the place of its first result: the window keeps its size. */
function Problem({ problem }: { problem: { state: 'failed' | 'empty'; message: string } }) {
  // Opaque: it lies over what the window shows, so the tint is mixed into the window's own ground, not left clear.
  const look = problem.state === 'failed'
    ? { background: `color-mix(in srgb, ${DANGER} 14%, ${SURFACE})`, color: DANGER_TEXT, border: `1px solid color-mix(in srgb, ${DANGER} 40%, transparent)` }
    : { background: `color-mix(in srgb, ${WARNING} 14%, ${SURFACE})`, color: WARNING_TEXT, border: `1px solid color-mix(in srgb, ${WARNING} 40%, transparent)` };
  return (
    <div
      role="alert"
      style={{ position: 'absolute', inset: 6, zIndex: 2, overflow: 'auto', padding: '8px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word', ...look }}
    >
      {problem.message}
    </div>
  );
}

/** A line of the page that is words, across the whole of it. */
function Note({ note }: { note: PageNote }) {
  const lines = note.text.split('\n').filter((line) => line.length > 0);
  return (
    <div style={{ gridColumn: '1 / -1', color: TEXT, minWidth: 0 }}>
      {note.style === 'h1' && <h1 style={{ margin: '8px 0 0', fontSize: 30, lineHeight: 1.15, fontWeight: 650 }}>{note.text}</h1>}
      {note.style === 'h2' && <h2 style={{ margin: '10px 0 0', fontSize: 20, lineHeight: 1.25, fontWeight: 600 }}>{note.text}</h2>}
      {note.style === 'p' && <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{note.text}</p>}
      {note.style === 'ul' && <ul style={{ margin: 0, paddingLeft: 22, fontSize: 16, lineHeight: 1.55, listStyle: 'disc' }}>{lines.map((line, at) => <li key={at}>{line}</li>)}</ul>}
      {note.style === 'space' && <div style={{ height: 20 }} aria-hidden />}
    </div>
  );
}

/** A small word at a window's corner: where it stands. Over the window, so it takes no room from it. */
function StateChip({ state }: { state: WindowState }) {
  const look = state === 'current' ? { background: SUCCESS_FILL, color: SUCCESS_TEXT }
    : state === 'stale' ? { background: WARNING_FILL, color: WARNING_TEXT }
      : state === 'running' || state === 'waiting' ? { background: ACCENT_FILL, color: ACCENT_TEXT }
        : state === 'failed' ? { background: DANGER_FILL, color: DANGER_TEXT }
          : state === 'empty' ? { background: WARNING_FILL, color: WARNING_TEXT }
        : { background: 'transparent', color: MUTED };
  return (
    <span
      role="status"
      style={{ position: 'absolute', top: 14, right: 16, zIndex: 2, padding: '2px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, pointerEvents: 'none', ...look }}
    >
      {STATE_WORDS[state]}
    </span>
  );
}
