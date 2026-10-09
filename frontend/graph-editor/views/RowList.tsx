import { Plus } from 'lucide-react';
import { ACCENT, ACCENT_FILL, ACCENT_TEXT, DIMMER, LINE, MUTED, RAISE, SUCCESS, TEXT } from '../../app/ui/theme';

/** One button of a row. */
export interface RowAction {
  id: string;
  label: string;
  title: string;
  disabled?: boolean;
  /** For a file: whether anything is written in it yet -- a filled mark if so, an empty one if not. */
  written?: boolean;
  /** Does something once and opens nothing: not a button that is lit while it is the one open. */
  once?: boolean;
}

/** A row: what it is called, an optional + that adds one more of it, and its buttons. */
export interface RowView {
  id: string;
  label: string;
  actions: RowAction[];
  add?: { title: string; onClick: () => void };
}

/** Which button is the one open, as `rowId:actionId`. */
export const at = (row: string, action: string): string => `${row}:${action}`;

/**
 * The rows to choose from: a name, and a button for each way of working on it.
 * The one open is lit. Drawing only -- the rows are declared by whoever knows
 * what the node is made of.
 */
export default function RowList({ rows, active, onAction }: {
  rows: RowView[];
  active: string | null;
  onAction: (row: RowView, action: RowAction) => void;
}) {
  return (
    <div className="grid items-center gap-x-2 gap-y-2" style={{ gridTemplateColumns: '76px 1fr 1fr' }}>
      {rows.map((row) => (
        <div key={row.id} className="contents" role="group" aria-label={row.label}>
          <span className="flex items-center gap-1.5 text-xs" style={{ color: MUTED }}>
            {row.label}
            {row.add && (
              <button
                type="button"
                onClick={row.add.onClick}
                title={row.add.title}
                aria-label={row.add.title}
                className="inline-flex items-center justify-center rounded-full hover-raise"
                style={{ width: 18, height: 18, border: `1px solid ${LINE}`, color: MUTED }}
              >
                <Plus size={11} strokeWidth={2.4} aria-hidden="true" />
              </button>
            )}
          </span>
          {row.actions.map((action, index) => {
            const lit = active === at(row.id, action.id);
            return (
              <button
                key={action.id}
                type="button"
                disabled={action.disabled}
                onClick={() => onAction(row, action)}
                title={action.title}
                aria-pressed={action.once ? undefined : lit}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg text-sm hover-raise"
                style={{
                  height: 34,
                  gridColumn: row.actions.length === 1 && index === 0 ? 'span 2' : undefined,
                  border: `1px solid ${lit ? ACCENT : LINE}`,
                  background: lit ? ACCENT_FILL : RAISE,
                  color: lit ? ACCENT_TEXT : TEXT,
                  fontWeight: lit ? 600 : 500,
                  opacity: action.disabled ? 0.5 : 1,
                }}
              >
                {action.written !== undefined && (
                  <span
                    aria-hidden="true"
                    style={{
                      width: 7, height: 7, borderRadius: '50%',
                      background: action.written ? SUCCESS : 'transparent',
                      border: `1.5px solid ${action.written ? SUCCESS : DIMMER}`,
                    }}
                  />
                )}
                {action.label}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
