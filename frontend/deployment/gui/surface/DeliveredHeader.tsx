import type { ReactNode } from 'react';
import type { RoundSnapshot } from '../kit/api/client';
import { stopRound } from '../kit/api/session';
import Button from '../kit/ui/Button';
import { DANGER_TEXT, DIM, LINE, MUTED, SURFACE, TEXT } from '../kit/ui/theme';

/** How a run went, in a word: going, done, or failed -- nothing before the first. */
function roundStatus(round: RoundSnapshot | null): { label: string; failed: boolean } {
  if (!round) return { label: '', failed: false };
  if (!round.done) return { label: '⏳ Running…', failed: false };
  const status = round.result?.status;
  if (status === 'success') return { label: '✅ Done', failed: false };
  if (status === 'error' || (!round.result && round.error && !round.cancelled)) return { label: '❌ Failed', failed: true };
  return { label: '', failed: false };
}

/**
 * The bar above the delivered gui: what this tool is -- the graph's name and
 * description -- and how its last run went, with a Stop while one goes.
 *
 * It has no ▶ Run. A tool runs when it is started (`startEvents`: its start points
 * that start themselves, or, with no start point at all, the whole graph once) and
 * afterwards when its gui is used -- its buttons, and the blocks that say
 * they start it -- or it is called.
 *
 * Every host draws the bar: `deployment/gui/GuiApp.tsx` for a tool someone
 * was handed, and the editor's running application (`ApplicationView`).
 */
export default function DeliveredHeader({ name, description, round, tools, note }: {
  name: string;
  description: string;
  /** The round going now, or the last one. */
  round: RoundSnapshot | null;
  /** Buttons of the host's own -- a deployed tool's ⚙ AI Settings, the editor's pop-out. */
  tools?: ReactNode;
  /** Said after them: a deployed tool's clock. */
  note?: ReactNode;
}) {
  const status = roundStatus(round);
  return (
    <header
      className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 shrink-0"
      style={{ background: SURFACE, borderBottom: `1px solid ${LINE}` }}
    >
      {/* Side by side, the description cut to one line; on a narrow screen the name has a line and the description the lines under it. */}
      <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 basis-full sm:basis-0">
        <span className="text-sm font-semibold" style={{ color: TEXT }}>
          {name || 'Tell & Wire'}
        </span>
        {description && (
          <span className="text-xs min-w-0 line-clamp-3 sm:line-clamp-1" style={{ color: DIM }}>{description}</span>
        )}
      </div>

      {tools}
      {note}
      {status.label && (
        <span className="text-xs font-medium whitespace-nowrap" style={{ color: status.failed ? DANGER_TEXT : MUTED }}>
          {status.label}
        </span>
      )}
      {round && !round.done && (
        <Button size="sm" className="shrink-0" onClick={() => { void stopRound(); }} title="Stop the run">■ Stop</Button>
      )}
    </header>
  );
}
