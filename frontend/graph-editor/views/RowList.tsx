import { Plus, RefreshCw } from 'lucide-react';
import { ACCENT, ACCENT_FILL, ACCENT_TEXT, DIMMER, LINE, MUTED, ON_ACCENT, RAISE, SUCCESS, TEXT, WARNING_FILL, WARNING_TEXT } from '../../app/ui/theme';

/** One button of a row. */
export interface RowAction {
  id: string;
  label: string;
  title: string;
  disabled?: boolean;
  /** For a file: whether anything is written in it yet -- a filled mark if so, an empty one if not. */
  written?: boolean;
  /** Does something once and opens nothing: a small action beside the row's name, not a choice that is lit while it is the one open. */
  once?: boolean;
}

/** A row: what it is called, the ports it stands for, an optional + that adds one more, and its buttons. */
export interface RowView {
  id: string;
  label: string;
  /** The ports the row's file is about, and -- when the file names others -- the file, as a warning. */
  ports?: { kind: 'input' | 'output'; names: string[]; stray?: { file: string } };
  actions: RowAction[];
  add?: { title: string; onClick: () => void };
}

/** Which button is the one open, as `rowId:actionId`. */
export const at = (row: string, action: string): string => `${row}:${action}`;

/** The mark on a file's button: filled where something is written in it. */
function Written({ written, on }: { written: boolean; on?: boolean }) {
  return (
    <span
      aria-hidden="true"
      title={written ? 'Written' : 'Empty'}
      style={{
        width: 7, height: 7, borderRadius: '50%', flex: 'none',
        background: written ? (on ? ON_ACCENT : SUCCESS) : 'transparent',
        border: `1.5px solid ${on ? ON_ACCENT : written ? SUCCESS : DIMMER}`,
      }}
    />
  );
}

/** One chip: a port's name, as it is written in the files. */
function Chip({ name, kind }: { name: string; kind: 'input' | 'output' }) {
  return (
    <span
      className="inline-flex items-center rounded-md px-1.5 text-xs font-mono"
      style={{ background: kind === 'input' ? ACCENT_FILL : `color-mix(in srgb, ${SUCCESS} 14%, transparent)`, color: kind === 'input' ? ACCENT_TEXT : SUCCESS }}
    >
      {name}
    </span>
  );
}

/**
 * The rows to choose from: a card for each, its name in bold -- with a small
 * action where it has one -- and a button for each way of
 * working on it. The one open is lit, and its card with it. Drawing only -- the
 * rows are declared by whoever knows what the node is made of.
 */
export default function RowList({ rows, active, onAction }: {
  rows: RowView[];
  active: string | null;
  onAction: (row: RowView, action: RowAction) => void;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((row) => {
        const choices = row.actions.filter((action) => !action.once);
        const small = row.actions.filter((action) => action.once);
        const open = choices.some((action) => active === at(row.id, action.id));
        return (
          <div
            key={row.id}
            role="group"
            aria-label={row.label}
            className="rounded-lg px-2.5 py-2 flex flex-col gap-2"
            style={{
              border: `1px solid ${open ? ACCENT : LINE}`,
              background: open ? ACCENT_FILL : RAISE,
              boxShadow: open ? `inset 3px 0 0 ${ACCENT_TEXT}` : undefined,
            }}
          >
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-semibold" style={{ color: TEXT }}>{row.label}</span>
              {row.ports?.names.map((name) => <Chip key={name} name={name} kind={row.ports!.kind} />)}
              {row.ports?.stray && (
                <span
                  className="text-xs rounded-md px-1.5 font-mono"
                  style={{ background: WARNING_FILL, color: WARNING_TEXT }}
                  title={`${row.ports.stray.file} names other ${row.ports.kind}s than the node has: the node's are the ones shown`}
                >
                  ≠ {row.ports.stray.file}
                </span>
              )}
              {row.add && (
                <button
                  type="button"
                  onClick={row.add.onClick}
                  title={row.add.title}
                  aria-label={row.add.title}
                  className="inline-flex items-center justify-center rounded-full hover-raise"
                  style={{ width: 18, height: 18, border: `1px dashed ${LINE}`, color: MUTED }}
                >
                  <Plus size={11} strokeWidth={2.4} aria-hidden="true" />
                </button>
              )}
              {small.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  disabled={action.disabled}
                  onClick={() => onAction(row, action)}
                  title={action.title}
                  className="ml-auto inline-flex items-center justify-center gap-1 rounded-md px-2 text-xs hover-raise"
                  style={{ height: 26, border: `1px solid ${LINE}`, color: MUTED, opacity: action.disabled ? 0.5 : 1 }}
                >
                  <RefreshCw size={12} strokeWidth={2} aria-hidden="true" />
                  Pull
                </button>
              ))}
            </div>
            <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${choices.length || 1}, 1fr)` }}>
              {choices.map((action) => {
                const lit = active === at(row.id, action.id);
                return (
                  <button
                    key={action.id}
                    type="button"
                    disabled={action.disabled}
                    onClick={() => onAction(row, action)}
                    title={action.title}
                    aria-pressed={lit}
                    className="inline-flex items-center justify-center gap-1.5 rounded-md text-sm hover-raise"
                    style={{
                      height: 32,
                      border: `1px solid ${lit ? ACCENT : LINE}`,
                      background: lit ? ACCENT : 'transparent',
                      color: lit ? ON_ACCENT : MUTED,
                      fontWeight: lit ? 600 : 500,
                      opacity: action.disabled ? 0.5 : 1,
                    }}
                  >
                    {action.written !== undefined && <Written written={action.written} on={lit} />}
                    {action.label}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
