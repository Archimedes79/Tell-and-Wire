// The words of the page as they are read when it is a web page: `**bold**`, `*italic*` or `_italic_`, `code` and [a link](https://…), as
// Markdown writes them. Written as typed in the page (the boxes of the page show the marks); drawn here, where the page is read.
//
// Small on purpose: those four, inside one another where it makes sense (a bold word with a code in it), and nothing that could
// put markup of its own into the page -- the words are text nodes, and a link is only ever http, https or mailto.

import type { ReactNode } from 'react';

/** What stands for one mark: the pattern that finds it, and what is drawn of its inside. */
const MARKS: { find: RegExp; draw: (inside: string, key: number, rest: (text: string) => ReactNode[]) => ReactNode }[] = [
  { find: /`([^`\n]+)`/, draw: (inside, key) => <code key={key} className="nb-inline-code">{inside}</code> },
  { find: /\*\*([^*\n]+?)\*\*/, draw: (inside, key, rest) => <strong key={key}>{rest(inside)}</strong> },
  { find: /\*([^*\s][^*\n]*?)\*/, draw: (inside, key, rest) => <em key={key}>{rest(inside)}</em> },
  { find: /(?<![\p{L}\p{N}_])_([^_\s][^_\n]*?)_(?![\p{L}\p{N}_])/u, draw: (inside, key, rest) => <em key={key}>{rest(inside)}</em> },
];

const LINK = /\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/;

/** *text* with its marks drawn: an array of nodes, in the order they are read. */
export function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest) {
    // The mark that begins first wins; where two begin together, the earlier in the list (a code keeps its stars).
    let best: { at: number; length: number; node: ReactNode } | null = null;
    const link = LINK.exec(rest);
    if (link) best = { at: link.index, length: link[0].length, node: <a key={key} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a> };
    for (const mark of MARKS) {
      const found = mark.find.exec(rest);
      if (found && (!best || found.index < best.at)) best = { at: found.index, length: found[0].length, node: mark.draw(found[1], key, inline) };
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
