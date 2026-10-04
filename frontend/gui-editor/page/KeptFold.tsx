import type { SessionView } from '../../app/api/client';
import { DIMMER, LINE, MUTED, NEUTRAL_BUTTON } from '../../app/ui/theme';
import { cut } from '../../app/ui/cut';

/** A value as it reads in a line: a text as it is, anything else as its JSON -- cut short either way. */
function brief(value: unknown): string {
  return cut(typeof value === 'string' ? value : JSON.stringify(value), 120);
}

/** What a node keeps, in words: what a start point was sent, what memory holds -- else the slot by its name. */
function slotWords(slot: string): string {
  if (slot === 'values') return 'was sent';
  if (slot === 'data_value') return 'holds';
  return `keeps as "${slot}"`;
}

/**
 * What using the graph left behind, which the design does not say: what each
 * start point was sent last, what each data node holds now, what each block
 * of the page holds -- each by the name a person knows it by -- and ↺ Start
 * over, which forgets it all. Folded, and said in its summary how much there
 * is: the state a round runs on is no secret, and never in the way.
 */
export default function KeptFold({ kept, nameOf, onStartOver }: {
  kept: SessionView['kept'] | undefined;
  /** A node's or a block's id, as a person reads it: its label. */
  nameOf: (id: string) => string;
  onStartOver: () => void;
}) {
  const lines = [
    ...Object.entries(kept?.nodes ?? {}).flatMap(([node, slots]) => Object.entries(slots)
      .map(([slot, value]) => `${nameOf(node)} ${slotWords(slot)}: ${brief(value)}`)),
    ...Object.entries(kept?.page ?? {}).map(([block, value]) => `On the page, ${nameOf(block)} holds: ${brief(value)}`),
  ];
  return (
    <details className="px-8 py-1.5 text-xs" style={{ borderBottom: `1px solid ${LINE}`, color: MUTED }}>
      <summary className="cursor-pointer select-none">
        What using it keeps{lines.length ? ` (${lines.length})` : ': nothing yet'}
      </summary>
      <div className="py-2 space-y-1">
        {lines.length
          ? lines.map((line) => <p key={line} className="font-mono" style={{ color: DIMMER }}>{line}</p>)
          : <p style={{ color: DIMMER }}>Nothing differs from the design: every round starts from what it says.</p>}
        <button type="button" onClick={onStartOver} disabled={!lines.length}
          className="mt-1 px-3 py-1 text-xs rounded-lg" style={{ ...NEUTRAL_BUTTON, opacity: lines.length ? 1 : 0.5 }}
          title="Forget what using it left behind: what its start points were sent, what its memory holds, what the page holds">
          ↺ Start over
        </button>
      </div>
    </details>
  );
}
