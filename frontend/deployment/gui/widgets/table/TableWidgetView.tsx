import type { WidgetViewProps } from '../WidgetView';
import SaveButton from '../SaveButton';
import { csvText, fileName, saveFile } from '../download';
import { inlineText } from '../../../../../gui/widgets/text_io/text.ts';
import { useState } from 'react';
import { columnsFrom, isTotal, rowOrder } from './figures';
import { DANGER_TEXT, DIMMER, LINE, MUTED, SUCCESS_TEXT, SUNKEN, TEXT } from '../../kit/ui/theme';

/**
 * The size a table's header and rows are drawn at, in pixels. Named because
 * the node feeding the table is told it (`TableWidgetGuiBuilder.textShown`),
 * and a size said in one place while drawn from another drifts apart.
 */
export const TABLE_TEXT = 12;

/**
 * The header and rows of *value*, in the two shapes data actually arrives in —
 * a list of objects sharing their keys (keys become the header) or a list of
 * lists whose first row is the header. Anything else is null.
 */
function toRows(value: unknown): { header: string[]; rows: string[][]; raw: unknown[][] } | null {
  let data = value;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(data) || data.length === 0) return null;

  const first = data[0];
  if (Array.isArray(first)) {
    const [header, ...rest] = data as unknown[][];
    return {
      header: header.map(String),
      rows: rest.map((row) => (Array.isArray(row) ? row.map(inlineText) : [inlineText(row)])),
      raw: rest.map((row) => (Array.isArray(row) ? row : [row])),
    };
  }
  if (first && typeof first === 'object') {
    // Union of keys, first-seen order: a row missing a key gets a blank cell
    // rather than shifting every column after it.
    const header: string[] = [];
    for (const row of data as Record<string, unknown>[]) {
      for (const key of Object.keys(row ?? {})) if (!header.includes(key)) header.push(key);
    }
    return {
      header,
      rows: (data as Record<string, unknown>[]).map((row) => header.map((key) => inlineText(row?.[key]))),
      raw: (data as Record<string, unknown>[]).map((row) => header.map((key) => row?.[key])),
    };
  }
  return null;
}

/**
 * Rows, as a table. Display-only, like the plot. What `toRows` cannot read is
 * shown as text rather than silently rendered empty, because "my table is
 * blank" is the least helpful failure there is.
 */
export default function TableWidgetView({ widget, value, incoming }: WidgetViewProps) {
  const data = incoming !== undefined ? incoming : value;
  // Sorted by a column when its name is pressed: once one way, again the other, again as it came.
  const [sorted, sortBy] = useState<{ column: number; descending: boolean } | null>(null);
  const table = toRows(data);
  // What is saved is what was read; what is shown is set as its cells say (`figures.ts`): figures to the right,
  // thousands told apart, a rise and a fall in colour.
  const columns = table ? columnsFrom(table.header, table.header.map((_, c) => table.raw.map((row) => row[c]))) : [];

  if (!table) {
    const nothing = data === undefined || data === null || data === '';
    const text = nothing ? 'No data yet' : typeof data === 'string' ? data : JSON.stringify(data);
    return (
      <div className="text-xs h-full overflow-auto" style={{ color: DIMMER }} title={widget.label}>
        {/* What came is shown as it is, and what a table is made of is said: the least a person needs to mend what feeds it. */}
        {!nothing && <p className="mb-1" style={{ color: MUTED }}>Not rows, so not a table: a list of objects, or a list of lists with the header first.</p>}
        {text}
      </div>
    );
  }

  const shown = sorted && sorted.column < table.header.length
    ? rowOrder(table.raw.map((row) => row[sorted.column]), sorted.descending, table.raw.map((row) => isTotal({ first: row[0] }, ['first'])))
    : table.rows.map((_, r) => r);
  const press = (column: number): void => sortBy(sorted?.column !== column ? { column, descending: false } : sorted.descending ? null : { column, descending: true });

  // The columns and the cells as shown here, so what a spreadsheet opens is what was read.
  const save = () => saveFile(fileName(widget.label, 'table', 'csv'), csvText(table.header, table.rows), 'text/csv');

  return (
    <div className="relative group h-full">
      <div className="h-full overflow-auto">
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: TABLE_TEXT }}>
          <thead>
            <tr>
              {table.header.map((cell, i) => (
                <th
                  key={i}
                  onClick={() => press(i)}
                  title="Sort by this column"
                  aria-sort={sorted?.column === i ? (sorted.descending ? 'descending' : 'ascending') : undefined}
                  style={{
                    cursor: 'pointer', userSelect: 'none',
                    textAlign: columns[i]?.numeric ? 'right' : 'left', padding: '3px 8px', position: 'sticky', top: 0,
                    borderBottom: `1px solid ${LINE}`, color: MUTED, fontWeight: 600,
                    // The GUI's own recessed colour, so the header follows its
                    // scheme -- a fixed near-black band sat on the light ones --
                    // and opaque, because rows scroll under a sticky header.
                    background: SUNKEN,
                  }}
                >
                  {cell}{sorted?.column === i ? (sorted.descending ? ' ▼' : ' ▲') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => [table.rows[r], r] as const).map(([row, r]) => (
              <tr key={r} style={isTotal({ first: table.raw[r][0] }, ['first']) ? { fontWeight: 600 } : undefined}>
                {row.map((cell, c) => {
                  const column = columns[c];
                  const value = table.raw[r][c];
                  const tone = column?.tone(value);
                  return (
                    <td
                      key={c}
                      style={{
                        padding: '3px 8px', borderBottom: `1px solid ${LINE}`, color: tone === 'up' ? SUCCESS_TEXT : tone === 'down' ? DANGER_TEXT : TEXT,
                        ...(column?.numeric ? { textAlign: 'right', fontVariantNumeric: 'tabular-nums' } : {}),
                      }}
                    >
                      {column && typeof value === 'number' ? column.show(value) : cell}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <SaveButton title="Save this table as a CSV file" onSave={save} />
    </div>
  );
}
