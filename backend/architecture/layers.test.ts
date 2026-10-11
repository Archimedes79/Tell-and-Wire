/**
 * The folders are the architecture, asserted on the import graph.
 *
 * The code is cut by tier, then by role, then by module (`docs/architecture.md`). What ships in a
 * package is decided by one thing: a path with a folder named `editor` is only the editor's, and the
 * rest is carried. So the rules are few:
 *
 * 1. Nothing outside an `editor` folder imports from one. (`backend/cli` may `import()` it: it
 *    composes, and a package without the editor is told so when a command asks for it.)
 * 2. `graph/` and `gui/` are neutral: they run in the browser and in Node, so they import no `node:*`,
 *    nothing of `backend/` or `frontend/`, and `graph/` nothing of `gui/`.
 * 3. In `backend/`, a module imports only from below: project, then runtime and gui, then host, then
 *    cli -- the editor's modules above the deployment's. Two modules of one rank do not import each
 *    other. The wire's files (`host/api.ts`) are types and tables for either end and rank with nothing.
 * 4. `frontend/` imports of `backend/` only the wire's files.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name === 'dist') return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const rel = (path: string): string => relative(ROOT, path).split(sep).join('/');
const SOURCES = ['graph', 'gui', 'backend', 'frontend'].flatMap((dir) => walk(join(ROOT, dir)))
  .map(rel)
  .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) && !path.startsWith('backend/architecture/') && !/\/test\//.test(path) && !path.endsWith('.d.ts'));
const KNOWN = new Set(walk(ROOT).map(rel));

interface Import { from: string; to: string; dynamic: boolean }
const IMPORT = /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?[^'";]*?\s*from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

const IMPORTS: Import[] = [];
const BUILTINS: { from: string; to: string }[] = [];
for (const from of SOURCES) {
  const text = readFileSync(join(ROOT, from), 'utf8');
  for (const match of text.matchAll(IMPORT)) {
    const spec = match[1] ?? match[2];
    if (spec.startsWith('node:')) { BUILTINS.push({ from, to: spec }); continue; }
    if (!spec.startsWith('.')) continue;
    const base = rel(resolve(ROOT, dirname(from), spec));
    const to = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((candidate) => KNOWN.has(candidate));
    if (to) IMPORTS.push({ from, to, dynamic: match[2] !== undefined });
  }
}

const inEditor = (path: string): boolean => path.split('/').includes('editor');
const show = (found: Import[]): string[] => found.map((one) => `${one.from} -> ${one.to}`).sort();

/** The module of a backend path, with its rank: lower is imported by higher. */
const RANK: Record<string, number> = {
  'deployment/project': 1, 'deployment/runtime': 2, 'deployment/gui': 2, 'deployment/host': 3,
  'editor/project': 4, 'editor/graph': 4, 'editor/runtime': 4, 'editor/host': 5, cli: 6,
};
const moduleOf = (path: string): string | undefined => {
  const found = /^backend\/(deployment|editor)\/([a-z]+)\//.exec(path);
  return found ? `${found[1]}/${found[2]}` : path.startsWith('backend/cli/') ? 'cli' : undefined;
};
/** The wire's files: the routes' types and tables, which either end imports. */
const isWire = (path: string): boolean => /^backend\/(deployment|editor)\/host\/api\.ts$/.test(path);

describe('the folders', () => {
  it('are found, so the rules below are checked against something', () => {
    expect(SOURCES.length).toBeGreaterThan(300);
    expect(IMPORTS.length).toBeGreaterThan(1000);
    expect(SOURCES.filter((path) => path.startsWith('backend/') && !isWire(path) && !moduleOf(path))).toEqual([]);
  });

  it('keep the editor to itself: nothing a package carries imports from an editor folder', () => {
    const against = IMPORTS.filter((one) => !inEditor(one.from) && inEditor(one.to) && !(one.dynamic && moduleOf(one.from) === 'cli'));
    expect(show(against)).toEqual([]);
  });

  it('keep graph/ and gui/ neutral: no Node, no backend, no frontend, and graph/ knows no gui', () => {
    const neutral = (path: string): boolean => path.startsWith('graph/') || path.startsWith('gui/');
    expect(BUILTINS.filter((one) => neutral(one.from)).map((one) => `${one.from} -> ${one.to}`)).toEqual([]);
    const against = IMPORTS.filter((one) => neutral(one.from) && (/^(backend|frontend)\//.test(one.to) || (one.from.startsWith('graph/') && one.to.startsWith('gui/'))));
    expect(show(against)).toEqual([]);
  });

  it('keep the backend in layers: a module imports from below, never from above or beside', () => {
    const against = IMPORTS.filter((one) => {
      if (!one.from.startsWith('backend/') || isWire(one.to)) return false;
      const [from, to] = [moduleOf(one.from), moduleOf(one.to)];
      if (!from || !to || from === to) return false;
      return RANK[to] >= RANK[from] && !(from.startsWith('editor/') && to.startsWith('editor/') && RANK[to] < RANK[from]);
    });
    expect(show(against)).toEqual([]);
  });

  it('let the frontend reach the backend only through the wire', () => {
    const against = IMPORTS.filter((one) => one.from.startsWith('frontend/') && one.to.startsWith('backend/') && !isWire(one.to));
    expect(show(against)).toEqual([]);
  });
});
