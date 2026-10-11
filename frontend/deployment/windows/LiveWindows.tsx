import { memo, useCallback, useRef } from 'react';
import type { GuiWidget } from '../gui/kit/guiWidget';
import { heldValue, roundGoing, setEdit, useSession } from '../gui/kit/api/session';
import { guiInUse, roundError, type GuiDesign } from '../gui/surface/guiInUse';
import type { useRound } from '../gui/surface/useRound';
import { WindowsSurface, type Decoration, type WindowState } from './WindowsSurface';
import { runWindows, useWindowRuns } from './windowRuns';
import { isCurrent, pageWindows, type WindowBlock } from './windowsInUse';

/** What a block holds when the session says nothing of it: its design. */
const designValues = (blocks: readonly GuiWidget[]) => new Map(blocks.map((block) => [block.id, block.value]));

/**
 * The page of windows in use, for the host that runs rounds: *design* with what the session holds,
 * and where each window stands (ready, running, done, out of date). Like `LiveGui`, it listens to the
 * session for itself.
 */
const LiveWindows = memo(function LiveWindows({ design, onEvent, cell, decorate }: {
  design: GuiDesign;
  onEvent: (block: GuiWidget) => void;
  cell?: number;
  decorate?: Decoration;
}) {
  const view = useSession((s) => s.view);
  const edits = useSession((s) => s.edits);
  const busy = useSession(roundGoing);
  const error = useSession((s) => roundError(s.round));
  const runs = useWindowRuns((s) => s.runs);
  const going = useWindowRuns((s) => s.going);

  const windows = pageWindows(design.blocks);
  const designed = designValues(design.blocks);
  const held = (id: string) => heldValue({ view, edits }, id, designed.get(id));
  const states: Record<string, WindowState> = Object.fromEntries(windows.map((window) => [
    window.id,
    going[0] === window.id ? 'running'
      : going.includes(window.id) ? 'waiting'
        : !runs[window.id] ? 'ready'
          : isCurrent(windows, runs, held, window.id) ? 'current' : 'stale',
  ]));

  return (
    <WindowsSurface
      gui={guiInUse(design, { view, edits, busy: busy || going.length > 0, error })}
      onValue={(block, value) => setEdit(block.id, value)}
      onEvent={onEvent}
      states={states}
      cell={cell}
      decorate={decorate}
    />
  );
});

export default LiveWindows;

/**
 * What a block of a window does when it starts one: run the window, and the ones before it that are
 * not current, in order (`runWindows`). *round* is the host's `useRound`.
 */
export function useWindowFire(design: Pick<GuiDesign, 'blocks'>, round: ReturnType<typeof useRound>): (block: GuiWidget) => void {
  const run = useRef(round.run);
  run.current = round.run;
  const asking = useRef(false);
  asking.current = round.requirements !== null;
  return useCallback((block: GuiWidget) => {
    const group = (block as WindowBlock).group;
    if (!group) return;
    const designed = designValues(design.blocks);
    void runWindows({
      windows: pageWindows(design.blocks),
      id: group,
      // Read when asked, not when the click was: what was set meanwhile is what the next window is run with.
      held: (id) => heldValue({ view: useSession.getState().view, edits: useSession.getState().edits }, id, designed.get(id)),
      run: (event, by) => run.current(event, by),
      asking: () => asking.current,
    });
  }, [design]);
}
