// A value, as a box of text reads it.
//
// What arrives at a box that shows may be anything: a chart's rows wired in
// to be read, a model's answer as an object, a summary per file. The page's
// blocks show a value with these functions -- a box of text, a picker, a
// table's cells, a tool's result without a page -- so a value reads the same
// wherever it is shown.

/**
 * Text as it is; a list as its items, one per line -- a blank line between
 * them once one is a paragraph or runs over lines, or three answers read as
 * one; a record as its keys and values, one a line -- `words: 32`, where its
 * values alone said "32" and nothing of what was counted; anything else as
 * what it is. `String()` of an object is "[object Object]", which says nothing
 * about the value it replaced.
 */
export function asText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const items = value.map(asText);
    return items.join(items.some((item) => item.length > 80 || item.includes('\n')) ? '\n\n' : '\n');
  }
  if (typeof value === 'object') return Object.entries(value).map(([key, part]) => `${key}: ${inlineText(part)}`).join('\n');
  return String(value);
}

/**
 * A value on one line, as a table's cell and a record's line read it: text as
 * it is, a list as its items joined with ", " -- `a, b`, not `["a","b"]` --
 * and a record inside as the JSON it is.
 */
export function inlineText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined).map(inlineText).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
