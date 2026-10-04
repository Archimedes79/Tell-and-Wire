import { describe, expect, it } from 'vitest';

/**
 * The page's layers, asserted on the import graph.
 *
 * An area may import from a lower one, never from a higher one, and never from
 * a sibling of its own rank. What each rank is:
 *
 *   0 app/ui           look, without knowing a graph: theme, tone, colour scheme, Modal
 *   1 app/graph        the document's types
 *   2 app/document     what a graph *is* to the editor: node kinds, the page's connections, grid placement
 *     app/api          the contract's client, and the session a page follows
 *   3 app/store        the open graph, its undo, what a round shows on it
 *   4 app/dialogs      small dialogs that ask the server something
 *   5 the elements     app/elements (the registry), graph-editor/nodes, gui-editor/widgets,
 *                      the fields their panels are made of, and graph-editor/authoring
 *   6 gui-editor/page  a page, drawn and designed
 *     graph-editor/canvas  the graph, drawn
 *   7 app (its files)  toolbar, sidebar, results
 *   8 app/App, gui-editor/runtime   the two things that are served
 *   9 app/main         the entry
 *
 * The elements are one tier and reach each other on purpose: a panel is made of
 * authoring editors and fields, and an authoring editor asks the registry what a
 * node is. A panel is a lazy chunk, so the static graph has no cycle in it
 * (`gui-editor/runtime/boundary.test.ts` holds that a tool never loads either).
 *
 * `runtime` ranks with `App` -- both are served -- but reaches far less: nothing
 * in the store, the canvas, authoring or the app's files, however indirectly, as
 * a delivered tool holds no graph. That is a rule on what is reached, not on one
 * import, so `gui-editor/runtime/boundary.test.ts` holds it.
 */
const ELEMENTS = ['app/elements', 'app/fields', 'graph-editor/nodes', 'graph-editor/fields', 'graph-editor/authoring', 'gui-editor/widgets'];
const RANK: Record<string, number> = {
  'app/ui': 0, 'app/graph': 1, 'app/document': 2, 'app/api': 2, 'app/store': 3, 'app/dialogs': 4,
  ...Object.fromEntries(ELEMENTS.map((area) => [area, 5])),
  'gui-editor/page': 6, 'graph-editor/canvas': 6, app: 7, 'app/App': 8, 'gui-editor/runtime': 8, 'app/main': 9,
};
const SIBLINGS = new Set(ELEMENTS.flatMap((from) => ELEMENTS.map((to) => `${from}>${to}`)));

const SOURCES = import.meta.glob('/{app,graph-editor,gui-editor}/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const FILES = new Map(
  Object.entries(SOURCES)
    .filter(([path]) => !/\.(test|d)\.tsx?$/.test(path))
    .map(([path, source]) => [path.slice(1), source]),
);

/** A part's folder -- or, for a file at the top of app/, app itself, or the file where it ranks of its own. */
const areaOf = (path: string): string => {
  const [part, second, third] = path.split('/');
  if (third) return `${part}/${second}`;
  const name = second.replace(/\.tsx?$/, '');
  return ['App', 'main', 'graph'].includes(name) ? `${part}/${name}` : part;
};

function resolve(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const parts = from.split('/').slice(0, -1).concat(spec.split('/'));
  const stack: string[] = [];
  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  const base = stack.join('/');
  return [base, `${base}.ts`, `${base}.tsx`].find((candidate) => FILES.has(candidate)) ?? null;
}

describe('the page\'s layers', () => {
  it('are found, so the rule below is checked against something', () => {
    expect(FILES.size).toBeGreaterThan(100);
    for (const area of new Set([...FILES.keys()].map(areaOf))) {
      expect(RANK[area], `${area}/ has no rank: say where it stands in the list above`).toBeDefined();
    }
  });

  it('are only imported from above', () => {
    const against: string[] = [];
    for (const [path, source] of FILES) {
      for (const match of source.matchAll(/(?:from|import\()\s*'(\.[^']+)'/g)) {
        const target = resolve(path, match[1]);
        if (!target) continue;
        const [from, to] = [areaOf(path), areaOf(target)];
        if (from === to) continue;
        const allowed = RANK[to] < RANK[from] || (RANK[to] === RANK[from] && SIBLINGS.has(`${from}>${to}`));
        if (!allowed) against.push(`${path} -> ${target}   (${from} ${RANK[from]}, ${to} ${RANK[to]})`);
      }
    }
    expect(against).toEqual([]);
  });
});
