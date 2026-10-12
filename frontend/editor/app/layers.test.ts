import { describe, expect, it } from 'vitest';

/**
 * The gui's layers, asserted on the import graph.
 *
 * An area may import from a lower one, never from a higher one, and never from
 * a sibling of its own rank. What each rank is:
 *
 *  -1 block type        what a block of a gui is made of
 *   0 ui, layout        look, without knowing a graph: theme, tone, colour scheme, Modal
 *   1 graph types       the document's types
 *   2 model             what a graph *is* to the editor: node kinds, the gui's connections, grid placement
 *     api               the contract's client, and the host a gui follows
 *   2.5 editor api      the same, with the routes only the editor's server has
 *   3 store             the open graph, its undo, what a round shows on it
 *     views             the node view's drawing, pure: props in, callbacks out
 *   4 dialogs           small dialogs that ask the server something
 *     deployed widgets  the views of the blocks, drawn alike in the editor and in a tool
 *     surface           the gui a tool renders, and the editor draws the same way
 *   5 the elements      document/elements (the registry), graph/nodes, gui/widgets,
 *                       the fields their panels are made of, and graph/writing
 *   6 gui               a gui, designed
 *     canvas            the graph, drawn
 *     node              one node, opened: what the view's rows and chats do
 *   7 the app's files   toolbar, sidebar, changes
 *   8 App, deployed app the two things that are served
 *   9 main              the entry
 *
 * The elements are one tier and reach each other on purpose: a panel is made of
 * writing editors and fields, and a writing editor asks the registry what a
 * node is. A panel is a lazy chunk, so the static graph has no cycle in it
 * (`deployment/gui/boundary.test.ts` holds that a tool never loads either).
 *
 * The deployed app ranks with `App` -- both are served -- but reaches far less:
 * nothing in the store, the canvas, writing or the app's files, however
 * indirectly, as a delivered tool holds no graph. That is a rule on what is
 * reached, not on one import, so `deployment/gui/boundary.test.ts` holds it.
 */
const ELEMENTS = [
  'editor/document/elements/', 'editor/app/fields/', 'editor/graph/nodes/', 'editor/graph/fields/', 'editor/graph/writing/', 'editor/gui/widgets/',
];
/** [area, rank, the folders and files it is made of]; the longest path a file starts with decides. */
const AREAS: [string, number, ...string[]][] = [
  ['block type', -1, 'deployment/gui/kit/guiWidget.ts'],
  ['ui', 0, 'deployment/gui/kit/ui/'],
  ['layout', 0, 'deployment/gui/kit/layout.ts'],
  ['graph types', 1, 'editor/document/graph.ts'],
  ['model', 2, 'editor/document/model/'],
  ['api', 2, 'deployment/gui/kit/api/'],
  ['editor api', 2.5, 'editor/api/'],
  ['store', 3, 'editor/document/store/'],
  ['views', 3, 'editor/graph/views/'],
  ['dialogs', 4, 'deployment/gui/kit/dialogs/', 'editor/app/dialogs/'],
  ['deployed widgets', 4.2, 'deployment/gui/widgets/'],
  ['surface', 4.5, 'deployment/gui/surface/'],
  ['windows', 4.6, 'deployment/windows/'],
  ...ELEMENTS.map((path): [string, number, string] => [path, 5, path]),
  ['gui', 6, 'editor/gui/'],
  ['canvas', 6, 'editor/graph/canvas/'],
  ['node', 6, 'editor/graph/node/'],
  ['the app', 7, 'editor/app/', 'editor/document/'],
  ['notebook', 7.5, 'editor/notebook/'],
  ['App', 8, 'editor/app/App.tsx'],
  ['deployed app', 8, 'deployment/gui/'],
  ['main', 9, 'editor/app/main.tsx', 'editor/notebook/main.tsx'],
];
const SIBLINGS = new Set(ELEMENTS.flatMap((from) => ELEMENTS.map((to) => `${from}>${to}`)));

const SOURCES = import.meta.glob('/{editor,deployment}/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const FILES = new Map(
  Object.entries(SOURCES)
    .filter(([path]) => !/\.(test|d)\.tsx?$/.test(path))
    .map(([path, source]) => [path.slice(1), source]),
);

const areaOf = (path: string) => AREAS
  .flatMap(([area, rank, ...paths]) => paths.filter((prefix) => path.startsWith(prefix)).map((prefix) => ({ area, rank, length: prefix.length })))
  .sort((a, b) => b.length - a.length)[0];

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

describe('the gui\'s layers', () => {
  it('are found, so the rule below is checked against something', () => {
    expect(FILES.size).toBeGreaterThan(100);
    expect([...FILES.keys()].filter((path) => !areaOf(path)), 'files in no area: say where they stand in the list above').toEqual([]);
  });

  it('are only imported from above', () => {
    const against: string[] = [];
    for (const [path, source] of FILES) {
      for (const match of source.matchAll(/(?:from|import\()\s*'(\.[^']+)'/g)) {
        const target = resolve(path, match[1]);
        if (!target) continue;
        const [from, to] = [areaOf(path), areaOf(target)];
        if (from.area === to.area) continue;
        const allowed = to.rank < from.rank || (to.rank === from.rank && SIBLINGS.has(`${from.area}>${to.area}`));
        if (!allowed) against.push(`${path} -> ${target}   (${from.area} ${from.rank}, ${to.area} ${to.rank})`);
      }
    }
    expect(against).toEqual([]);
  });
});
