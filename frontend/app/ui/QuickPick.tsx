import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ACCENT, ACCENT_FILL, DIMMER, FIELD, LINE, MUTED, SURFACE, TEXT } from './theme';

/** One thing the pick offers: what it is called, its icon, and the other words it is found by. */
interface PickEntry {
  label: string;
  icon: LucideIcon;
  /** Other words someone might type for it. */
  also?: string;
  /** The icon's colour; the muted text colour without one. */
  ink?: string;
}

const found = (entry: PickEntry, query: string): boolean => {
  const needle = query.trim().toLowerCase();
  return !needle || `${entry.label} ${entry.also ?? ''}`.toLowerCase().includes(needle);
};

/**
 * A search menu: type what you want, press Enter, keep going. Used where a thing
 * is added without the hand leaving the keyboard or the eye leaving the
 * work -- a block on the page (`/`), a node on a wire let go on empty canvas.
 * It knows nothing of either: it is handed the entries, and says which was picked.
 *
 * It searches by what people call things (`also`), not by what we call them.
 * Escape and a click elsewhere close it.
 */
export default function QuickPick<T extends PickEntry>({
  entries, keyOf, match = found, onPick, onClose, label, placeholder, footer, style,
}: {
  entries: readonly T[];
  keyOf: (entry: T) => string;
  /** Whether *entry* answers *query*; by its label and `also` unless given. */
  match?: (entry: T, query: string) => boolean;
  onPick: (entry: T) => void;
  onClose: () => void;
  /** What the box is for, read aloud. */
  label: string;
  placeholder: string;
  /** A line under the list: what picking will do. */
  footer?: string;
  /** Where it stands and how wide. */
  style?: CSSProperties;
}) {
  const [query, setQuery] = useState('');
  const [at, setAt] = useState(0);
  const box = useRef<HTMLInputElement | null>(null);
  const shown = entries.filter((entry) => match(entry, query));

  useEffect(() => { box.current?.focus(); }, []);
  useEffect(() => { setAt(0); }, [query]);

  return (
    <div
      className="rounded-lg shadow-lg"
      style={{ width: 280, background: SURFACE, border: `1px solid ${ACCENT}`, ...style }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <input
        ref={box}
        className="w-full rounded-t-lg px-3 py-2 text-sm outline-none"
        style={{ ...FIELD, border: 'none', borderBottom: `1px solid ${LINE}` }}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        onBlur={onClose}
        onKeyDown={(event) => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
          if (event.key === 'ArrowDown') { event.preventDefault(); setAt((was) => Math.min(shown.length - 1, was + 1)); }
          if (event.key === 'ArrowUp') { event.preventDefault(); setAt((was) => Math.max(0, was - 1)); }
          if (event.key === 'Enter' && shown[at]) { event.preventDefault(); onPick(shown[at]); }
        }}
      />
      <div className="py-1 overflow-y-auto" style={{ maxHeight: 260 }}>
        {shown.length === 0 && (
          <p className="px-3 py-2 text-xs" style={{ color: DIMMER }}>Nothing is called that.</p>
        )}
        {shown.map((entry, index) => (
          <button
            key={keyOf(entry)}
            type="button"
            className="w-full flex items-center gap-3 px-3 py-1.5 text-sm text-left"
            style={{ color: TEXT, background: index === at ? ACCENT_FILL : 'transparent' }}
            // mousedown, not click: the input's blur closes the menu before a click lands.
            onMouseDown={(event) => { event.preventDefault(); onPick(entry); }}
            onMouseEnter={() => setAt(index)}
          >
            <entry.icon size={15} strokeWidth={2} aria-hidden="true" style={{ color: entry.ink ?? MUTED }} />
            <span>{entry.label}</span>
          </button>
        ))}
      </div>
      {footer && (
        <p className="px-3 py-2 text-xs" style={{ color: DIMMER, borderTop: `1px solid ${LINE}` }}>{footer}</p>
      )}
    </div>
  );
}
