// How the cells of a table are set in the notebook: a column of figures stands to the right, with the same decimals all the way down and thousands
// told apart; a signed percentage is green or red; a row that says Total is the sum, set apart. What a key-figure table needs, and
// all of it read off the cells, so a table written by a code step needs nothing more than its rows.

export interface Column {
  name: string;
  /** Figures stand to the right. */
  numeric: boolean;
  /** The cell as it is read. */
  show: (value: unknown) => string;
  /** Whether a cell is a rise or a fall, for the colour it is set in. */
  tone: (value: unknown) => 'up' | 'down' | undefined;
}

const MINUS = /^[-−]/;
const EMPTY = /^\s*[-–—]?\s*$/;
/** A figure written as text: "+10.2 %", "€ 1,200.50", "71 kg", "3,5". */
const FIGURE = /^[+\-−]?\s?(?:[$€£]\s?)?\d[\d.,'\s]*(?:\s?(?:%|[A-Za-z€$£]{1,4}))?$/;
/** Numbers that are names, not amounts: no thousands told apart in a year or an id. */
const NAMED = /year|jahr|\bid\b|\bnr\b|number|code|zip|plz|month|monat/i;
/** The words of a total row. */
const TOTAL = /^(total|sum|overall|grand total|gesamt|summe|insgesamt)$/i;

const blank = (value: unknown): boolean => value === null || value === undefined || (typeof value === 'string' && EMPTY.test(value));
const isFigure = (value: unknown): boolean => blank(value) || typeof value === 'number' || (typeof value === 'string' && FIGURE.test(value.trim()));

const text = (value: unknown): string => (typeof value === 'string' ? value : value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value));

/**
 * The columns of *rows* (objects), in the order their names are given, set as their cells say. Figures are set as English sets them whatever
 * the browser speaks (174,898 and 71.62): a code step writes "+10.2 %" with a point, and one table does not use two ways of writing a number.
 */
export function columnsOf(rows: Record<string, unknown>[], names: string[], locale = 'en-US'): Column[] {
  return columnsFrom(names, names.map((name) => rows.map((row) => row[name])), locale);
}

/** The same for cells given a column at a time: `cells[i]` are those under `names[i]`. */
export function columnsFrom(names: string[], columns: unknown[][], locale = 'en-US'): Column[] {
  return names.map((name, at) => {
    const cells = columns[at] ?? [];
    const filled = cells.filter((one) => !blank(one));
    const numeric = filled.length > 0 && filled.every(isFigure);
    const decimals = cells.some((one) => typeof one === 'number' && !Number.isInteger(one));
    const group = !NAMED.test(name);
    const format = new Intl.NumberFormat(locale, { minimumFractionDigits: decimals ? 2 : 0, maximumFractionDigits: decimals ? 2 : 0, useGrouping: group });
    return {
      name,
      numeric,
      // A column of figures is set evenly; one that mixes words and numbers (a name and its value) keeps each number as it is.
      show: (value) => (typeof value === 'number' && Number.isFinite(value) ? (numeric ? format.format(value) : String(value)) : text(value)),
      tone: (value) => {
        if (typeof value !== 'string' || !/%\s*$/.test(value.trim())) return undefined;
        const one = value.trim();
        return MINUS.test(one) ? 'down' : one.startsWith('+') ? 'up' : undefined;
      },
    };
  });
}

/** Whether a row is the sum of the others, by what its first cell says. */
export function isTotal(row: Record<string, unknown>, names: string[]): boolean {
  const first = row[names[0]];
  return typeof first === 'string' && TOTAL.test(first.trim());
}
