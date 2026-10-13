import { describe, expect, it } from 'vitest';

/**
 * The notebook's layers, asserted on the import graph: the same rule as the graph editor's (`editor/app/layers.test.ts`), written
 * for the notebook alone. An area may import from a lower one, never from a higher one, and never from a sibling of its own rank.
 *
 *   1 document    what the page holds and does: the store, the runs, the client, and what an input holds
 *     look        light or dark, kept in the browser
 *   2 elements    the boxes a window is made of: the inputs and outputs, the chart, the file browser
 *   3 gui-notebook   the page and its windows, to be used
 *     graph-notebook the list of cells, under the hood, and the debug window: the windows seen as a graph
 *   4 the shell   the top bar, the first page
 *   5 main        the entry
 *
 * The two views of a document are siblings and do not import each other: both stand on the elements, and the shell composes them.
 */
const AREAS: [string, number, ...string[]][] = [
  ['document', 1, 'notebook/document/'],
  ['look', 1, 'notebook/look.ts'],
  ['elements', 2, 'notebook/elements/'],
  ['gui-notebook', 3, 'gui-notebook/'],
  ['graph-notebook', 3, 'graph-notebook/'],
  ['shell', 4, 'notebook/App.tsx', 'notebook/Start.tsx'],
  ['main', 5, 'notebook/main.tsx'],
];

const SOURCES = import.meta.glob('/{notebook,gui-notebook,graph-notebook}/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const FILES = new Map(
  Object.entries(SOURCES)
    .filter(([path]) => !/\.(test|d)\.tsx?$/.test(path) && !path.startsWith('/notebook/dist/'))
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

describe('the notebook\'s layers', () => {
  it('are found, so the rule below is checked against something', () => {
    expect(FILES.size).toBeGreaterThan(15);
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
        if (to.rank >= from.rank) against.push(`${path} -> ${target}   (${from.area} ${from.rank}, ${to.area} ${to.rank})`);
      }
    }
    expect(against).toEqual([]);
  });
});
