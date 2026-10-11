import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { EVENT, LINE, MUTED, RAISE, TEXT } from './theme';

/**
 * A small pill that names one thing -- a start point a block sends to, the end
 * point it shows. `onRemove` gives it a ✕. `event` is the colour of a point the
 * page meets the graph at (the amber of the ◆), `neutral` anything else.
 */
export default function Chip({ children, onRemove, removeLabel = 'Remove', tone = 'neutral', title }: {
  children: ReactNode;
  onRemove?: () => void;
  /** What the ✕ says it does, where several chips stand together: "Stop sending to Summarize". */
  removeLabel?: string;
  tone?: 'neutral' | 'event';
  title?: string;
}) {
  const event = tone === 'event';
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full pl-2.5 text-xs max-w-full"
      style={{
        paddingRight: onRemove ? 4 : 10,
        paddingBlock: 2,
        color: event ? EVENT : TEXT,
        background: event ? `color-mix(in srgb, ${EVENT} 14%, transparent)` : RAISE,
        border: `1px solid ${event ? `color-mix(in srgb, ${EVENT} 40%, transparent)` : LINE}`,
      }}
      title={title}
    >
      <span className="truncate">{children}</span>
      {onRemove && (
        <button
          type="button"
          className="hover-raise rounded-full p-0.5 shrink-0"
          style={{ color: MUTED }}
          onClick={onRemove}
          aria-label={removeLabel}
          title={removeLabel}
        >
          <X size={12} strokeWidth={2.5} aria-hidden="true" />
        </button>
      )}
    </span>
  );
}
