// A long text, read in pieces that end where a person would stop: at a blank
// line if there is one in the second half of the piece, else at a line end, a
// sentence end, a space -- and only then in the middle of a word.

export interface Piece {
  text: string;
  start: number;
  end: number;
  /** Where the next piece starts, or null when this one reaches the end. */
  next: number | null;
}

export function piece(text: string, start: number, max: number): Piece {
  const from = Math.min(Math.max(0, Math.trunc(start)), text.length);
  const limit = Math.min(text.length, from + max);
  let end = limit;
  if (limit < text.length) {
    const window = text.slice(from, limit);
    const half = max / 2;
    const at = (index: number) => (index > half ? from + index : -1);
    const cut = [
      at(window.lastIndexOf('\n\n')),
      at(window.lastIndexOf('\n')),
      at(Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? ')) + 1 || -1),
      at(window.lastIndexOf(' ')),
    ].find((index) => index > from);
    if (cut !== undefined) end = cut;
    // Never between the two halves of a character that takes two UTF-16 units.
    const last = text.charCodeAt(end - 1);
    if (end > from + 1 && last >= 0xd800 && last <= 0xdbff) end -= 1;
  }
  let next = end;
  while (next < text.length && /\s/.test(text[next])) next += 1;
  return { text: text.slice(from, end).trimEnd(), start: from, end, next: next < text.length ? next : null };
}
