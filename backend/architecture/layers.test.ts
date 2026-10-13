/**
 * The folders are the architecture, asserted on the import graph.
 *
 * The code is cut by tier, then by role, then by module (`docs/architecture.md`). What ships in a
 * package is decided by one thing: a path with a folder named `editor` or `notebook` is only for
 * authoring, and the rest is carried (`backend/authoring` is not among the folders a package carries).
 * So the rules are few:
 *
 * 1. Nothing outside an authoring folder (`editor`, `notebook`, `authoring`) imports from one. (`backend/cli` may `import()` it: it
 *    composes, and a package without the editor is told so when a command asks for it.)
 * 2. `graph/` and `gui/` are neutral: they run in the browser and in Node, so they import no `node:*`,
 *    nothing of `backend/` or `frontend/`, and `graph/` nothing of `gui/`. Their tests too: a test that
 *    needs a run belongs to `backend/`, which runs.
 * 3. In `backend/`, a module imports only from below: project, then runtime and GUI, then host, then
 *    cli -- the editor's modules above the deployment's. Two modules of one rank do not import each
 *    other. The wire's files (`host/api.ts`) are types and tables for either end and rank with nothing.
 * 4. `frontend/` imports of `backend/` only the wire's files.
 * 5. The two products -- the graph editor and the notebook -- do not import each other, in any tier: each is started by a file of its
 *    own, and either can be taken away without the other noticing. What they share is below them: `graph/`, `gui/`, the deployment, and
 *    `backend/authoring`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { filesUnder } from './filesUnder.ts';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');

const walk = (dir: string): string[] => filesUnder(dir, ['node_modules', 'dist']);

const rel = (path: string): string => relative(ROOT, path).split(sep).join('/');
const SOURCES = ['graph', 'gui', 'backend', 'frontend'].flatMap((dir) => walk(join(ROOT, dir)))
  .map(rel)
  .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) && !path.startsWith('backend/architecture/') && !/\/test\//.test(path) && !path.endsWith('.d.ts'));
const KNOWN = new Set(walk(ROOT).map(rel));

interface Import { from: string; to: string; dynamic: boolean }
const IMPORT = /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?[^'";]*?\s*from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;

const IMPORTS: Import[] = [];
const BUILTINS: { from: string; to: string }[] = [];
/** The imports of one file: the ones into this repo, and the ones of Node. */
function importsOf(from: string): { found: Import[]; builtins: { from: string; to: string }[] } {
  const found: Import[] = [];
  const builtins: { from: string; to: string }[] = [];
  for (const match of readFileSync(join(ROOT, from), 'utf8').matchAll(IMPORT)) {
    const spec = match[1] ?? match[2] ?? match[3];
    if (spec.startsWith('node:')) { builtins.push({ from, to: spec }); continue; }
    if (!spec.startsWith('.')) continue;
    const base = rel(resolve(ROOT, dirname(from), spec));
    const to = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((candidate) => KNOWN.has(candidate));
    if (to) found.push({ from, to, dynamic: match[2] !== undefined });
  }
  return { found, builtins };
}
for (const from of SOURCES) {
  const { found, builtins } = importsOf(from);
  IMPORTS.push(...found);
  BUILTINS.push(...builtins);
}
/** The tests of graph/ and gui/ are not carried, but they sit in the neutral folders and import like them. */
const NEUTRAL_TESTS = ['graph', 'gui'].flatMap((dir) => walk(join(ROOT, dir))).map(rel).filter((path) => /\.test\.tsx?$/.test(path));

/** The folders only authoring uses: the editor's, the notebook's (its frontend is in three), and what both write with. */
const AUTHORING = new Set(['editor', 'notebook', 'gui-notebook', 'graph-notebook', 'authoring']);
/** A path only authoring uses: the editor's, the notebook's, or what both write with (`backend/authoring`). */
const inAuthoring = (path: string): boolean => path.split('/').some((part) => AUTHORING.has(part));

/** The folders each product owns, in every tier. */
const PRODUCTS: Record<string, string[]> = {
  editor: ['backend/editor/', 'frontend/editor/'],
  notebook: ['backend/notebook/', 'frontend/notebook/', 'frontend/gui-notebook/', 'frontend/graph-notebook/', 'gui/notebook/'],
};
const productOf = (path: string): string | undefined => Object.keys(PRODUCTS).find((name) => PRODUCTS[name].some((prefix) => path.startsWith(prefix)));
const show = (found: Import[]): string[] => found.map((one) => `${one.from} -> ${one.to}`).sort();

/** The module of a backend path, with its rank: lower is imported by higher. */
const RANK: Record<string, number> = {
  'deployment/project': 1, 'deployment/runtime': 2, 'deployment/gui': 2, 'deployment/host': 3,
  authoring: 3.5,
  'editor/project': 4, 'editor/graph': 4, 'editor/runtime': 4, 'editor/host': 5, notebook: 5, cli: 6, 'notebook/main': 7,
};
const moduleOf = (path: string): string | undefined => {
  const found = /^backend\/(deployment|editor)\/([a-z]+)\//.exec(path);
  if (found) return `${found[1]}/${found[2]}`;
  // The notebook's start file is above the command line it starts a product with; the rest of the notebook is a host's rank.
  if (path === 'backend/notebook/main.ts') return 'notebook/main';
  if (path.startsWith('backend/notebook/')) return 'notebook';
  if (path.startsWith('backend/authoring/')) return 'authoring';
  return path.startsWith('backend/cli/') ? 'cli' : undefined;
};
/** The wire's files: the routes' types and tables, which either end imports. */
const isWire = (path: string): boolean => /^backend\/(deployment\/host|editor\/host|notebook)\/api\.ts$/.test(path);

describe('the folders', () => {
  it('are found, so the rules below are checked against something', () => {
    expect(SOURCES.length).toBeGreaterThan(300);
    expect(IMPORTS.length).toBeGreaterThan(1000);
    expect(SOURCES.filter((path) => path.startsWith('backend/') && !isWire(path) && !moduleOf(path))).toEqual([]);
  });

  it('keep authoring to itself: nothing a package carries imports from an editor, notebook or authoring folder', () => {
    const against = IMPORTS.filter((one) => !inAuthoring(one.from) && inAuthoring(one.to) && !(one.dynamic && moduleOf(one.from) === 'cli'));
    expect(show(against)).toEqual([]);
  });

  it('keep graph/ and gui/ neutral: no Node, no backend, no frontend, and graph/ knows no GUI', () => {
    const neutral = (path: string): boolean => path.startsWith('graph/') || path.startsWith('gui/');
    expect(BUILTINS.filter((one) => neutral(one.from)).map((one) => `${one.from} -> ${one.to}`)).toEqual([]);
    const imports = [...IMPORTS, ...NEUTRAL_TESTS.flatMap((path) => importsOf(path).found)];
    const against = imports.filter((one) => neutral(one.from) && (/^(backend|frontend)\//.test(one.to) || (one.from.startsWith('graph/') && one.to.startsWith('gui/'))));
    expect(show(against)).toEqual([]);
  });

  it('keep the backend in layers: a module imports from below, never from above or beside', () => {
    const against = IMPORTS.filter((one) => {
      if (!one.from.startsWith('backend/') || isWire(one.to)) return false;
      const [from, to] = [moduleOf(one.from), moduleOf(one.to)];
      if (!from || !to || from === to) return false;
      return RANK[to] >= RANK[from];
    });
    expect(show(against)).toEqual([]);
  });

  it('keep the two products apart: the editor and the notebook import nothing of each other', () => {
    const against = IMPORTS.filter((one) => {
      const [from, to] = [productOf(one.from), productOf(one.to)];
      return from !== undefined && to !== undefined && from !== to;
    });
    expect(show(against)).toEqual([]);
  });

  it('let the notebook use of the editor-named folders only what both write with: the check of a gui and the writing of a graph handed on', () => {
    // graph/editor and gui/editor are shared, and neutral; these two files are all the notebook asks of them. Another one is the editor's, or goes beside them.
    const BOTH_WRITE_WITH = new Set(['gui/editor/check.ts', 'graph/editor/handedOn.ts']);
    const against = IMPORTS.filter((one) => productOf(one.from) === 'notebook' && /^(gui|graph)\/editor\//.test(one.to) && !BOTH_WRITE_WITH.has(one.to));
    expect(show(against)).toEqual([]);
  });

  it('let the frontend reach the backend only through the wire', () => {
    const against = IMPORTS.filter((one) => one.from.startsWith('frontend/') && one.to.startsWith('backend/') && !isWire(one.to));
    expect(show(against)).toEqual([]);
  });
});
