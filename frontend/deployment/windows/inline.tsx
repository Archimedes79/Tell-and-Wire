import type { ReactNode } from 'react';
import { ACCENT_TEXT, LINE, SUNKEN } from '../gui/kit/ui/theme';

/**
 * The words of a delivered page as they are read: `**bold**`, `*italic*` or `_italic_`, `code` and [a link](https://…), as Markdown writes them.
 *
 * Small on purpose, and a copy of its own (the notebook draws the same marks with `frontend/notebook/elements/inline.tsx`; the two products
 * share no code): the words are text nodes, nothing in them can put markup into the page, and a link is only ever http, https or mailto.
 */
const MARKS: { find: RegExp; draw: (inside: string, key: number) => ReactNode }[] = [
  { find: /`([^`\n]+)`/, draw: (inside, key) => <code key={key} style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.9em', padding: '1px 5px', borderRadius: 5, background: SUNKEN, border: `1px solid ${LINE}` }}>{inside}</code> },
  { find: /\*\*([^*\n]+?)\*\*/, draw: (inside, key) => <strong key={key}>{inline(inside)}</strong> },
  { find: /\*([^*\s][^*\n]*?)\*/, draw: (inside, key) => <em key={key}>{inline(inside)}</em> },
  { find: /(?<![\p{L}\p{N}_])_([^_\s][^_\n]*?)_(?![\p{L}\p{N}_])/u, draw: (inside, key) => <em key={key}>{inline(inside)}</em> },
];

const LINK = /\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/;

/** *text* with its marks drawn, as nodes in the order they are read. */
export function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest) {
    // The mark that begins first wins; where two begin together, the earlier in the list (a code keeps its stars).
    let best: { at: number; length: number; node: ReactNode } | null = null;
    const link = LINK.exec(rest);
    if (link) {
      best = { at: link.index, length: link[0].length, node: <a key={key} href={link[2]} target="_blank" rel="noopener noreferrer" style={{ color: ACCENT_TEXT, textDecoration: 'underline' }}>{link[1]}</a> };
    }
    for (const mark of MARKS) {
      const found = mark.find.exec(rest);
      if (found && (!best || found.index < best.at)) best = { at: found.index, length: found[0].length, node: mark.draw(found[1], key) };
    }
    if (!best) {
      nodes.push(rest);
      break;
    }
    if (best.at > 0) nodes.push(rest.slice(0, best.at));
    nodes.push(best.node);
    key += 1;
    rest = rest.slice(best.at + best.length);
  }
  return nodes;
}
