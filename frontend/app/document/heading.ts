// A node's heading: never empty.
//
// A node is its heading and its text. A new one is given a heading at once --
// its kind and a number, "Code 1" -- and while nobody has changed that, it
// becomes a short one written from the text as soon as there is a text. A
// heading field emptied is not a heading: it goes back to the one before.

/** The heading a new node of *kind* is given: the kind and the lowest number no heading in *taken* has. */
export function numberedHeading(kind: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let n = 1; ; n += 1) if (!used.has(`${kind} ${n}`)) return `${kind} ${n}`;
}

/** Whether *heading* is still one a new node is given -- a kind and a number: nobody has written one. */
export function isNumberedHeading(heading: string): boolean {
  return /^\S+ \d+$/.test(heading.trim());
}

/** The first line of *text* that says something, trimmed: what a card or a list of nodes has room for of a node's text. */
export function firstLine(text: string): string {
  return text.split('\n').map((line) => line.trim()).find(Boolean) ?? '';
}

/** Words a heading does not end on: they lead on to what was left out. */
const LEADS_ON = new Set(['a', 'an', 'the', 'its', 'their', 'and', 'or', 'but', 'then', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'by', 'from', 'into', 'as', 'what', 'which', 'that']);

/** Words that join a second thing to the first: one word after them, cut off, says nothing yet. */
const JOINS = new Set(['and', 'or', 'then', 'but']);

/**
 * A short heading written from *text*: the start of its first sentence, up to
 * where the thought turns (a colon, a comma, a dash), at most seven words, not
 * ending on one that leads on ("its", "the", "and") -- nor, cut short, on "and"
 * and one word. Not cut at " and " otherwise: what a node is for often comes
 * after it -- "Read the text and say its mood in one word" is "Read the text
 * and say its mood", where "Read the text" said nothing of the mood. Undefined
 * for a text that says nothing.
 */
export function headingFromText(text: string): string | undefined {
  const sentence = text.trim().split('\n')[0].split(/(?<=[.!?])\s/)[0];
  const clause = sentence.split(/\s+--\s+|[:;,(]/)[0].replace(/[.!?]+$/, '').trim();
  const all = clause.split(/\s+/).filter(Boolean);
  const words = all.slice(0, 7);
  while (words.length > 1 && LEADS_ON.has(words[words.length - 1].toLowerCase())) words.pop();
  // "Reads the chosen file and says" read as broken off: the verb's object was cut.
  if (words.length < all.length && words.length > 3 && JOINS.has(words[words.length - 2].toLowerCase())) words.splice(-2);
  if (!words.length) return undefined;
  const heading = words.join(' ');
  return heading.charAt(0).toUpperCase() + heading.slice(1);
}
