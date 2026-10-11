import { describe, it, expect } from 'vitest';

/**
 * The deployment boundary, asserted on the import graph.
 *
 * A deployed tool is built from `runtime.html` → `deployment/gui/main.tsx`.
 * Whatever that entry point can reach, transitively, is in the bundle a
 * recipient downloads; whatever it cannot reach is not there at all. That
 * distinction is why the editing affordances moved out of the gui component
 * instead of being switched off with a flag: a flag that is false at run time
 * leaves the code in the bundle, and the deployed tool really was shipping the
 * palette, the drag grip and the properties panel inside a chunk it loaded and
 * never used.
 *
 * So the rule is checked where it is actually decided -- in the imports,
 * rather than in a naming convention or a review habit. The walk starts from
 * every file at the top of `deployment/gui/`, not only the entry point: one
 * that nothing imports yet is held to the same rule before it is wired in. It
 * follows imports through every area, which the editor's layer rule
 * (`layers.test.ts`) cannot: that one sees a single import at a time. And it
 * follows them into graph/, gui/ and backend/, where the gui is held to load
 * nothing that runs a graph. An import of types only is erased and ships
 * nothing, so it is not followed.
 *
 * The sources are read through `import.meta.glob` rather than `node:fs`, so the
 * test needs no Node types and runs under the same config as everything else.
 */

// Rooted at the frontend's root, not relative: a relative pattern from inside
// deployment/gui silently omits the folder itself, and the walker then starts nowhere.
const SOURCES = import.meta.glob('/{editor,deployment}/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
// The neutral definitions and the backend, beside the frontend rather than inside it.
const OUTSIDE = import.meta.glob(['../../../{graph,gui,backend}/**/*.ts', '!**/node_modules/**'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** Every source by its path: the frontend's from its root, the others' from theirs (`graph/…`, `gui/…`, `backend/…`). */
const BY_PATH = new Map([
  ...Object.entries(SOURCES).map(([key, source]) => [key.slice(1), source] as const),
  ...Object.entries(OUTSIDE).map(([key, source]) => [key.replace(/^(\.\.\/)+/, ''), source] as const),
]);

/**
 * The modules *source* loads code from, by relative path. An import of types
 * only ships nothing.
 */
function loads(source: string): string[] {
  const specs: string[] = [];
  for (const [, clause, spec] of source.matchAll(/(?:^|\n)\s*(?:import|export)\s+([^;]*?)\s*from\s+'(\.[^']+)'/g)) {
    const names = /^\{([^}]*)\}$/.exec(clause.trim())?.[1];
    const typesOnly = /^type\b/.test(clause.trim())
      || (names !== undefined && names.split(',').map((name) => name.trim()).filter(Boolean).every((name) => name.startsWith('type ')));
    if (!typesOnly) specs.push(spec);
  }
  return specs;
}

function resolveSpec(fromPath: string, spec: string): string | null {
  const parts = fromPath.split('/').slice(0, -1).concat(spec.split('/'));
  const stack: string[] = [];
  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  const base = stack.join('/');
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (BY_PATH.has(candidate)) return candidate;
  }
  return null;
}

/**
 * Every module the deployed gui reaches -- what a deployed tool is built from
 * -- each with the module that first imported it, or null for one of its own.
 */
function deployedImports(): Map<string, string | null> {
  const reachedBy = new Map<string, string | null>();
  // Breadth first, so the way a module is said to be reached is a shortest one.
  const queue: [string, string | null][] = [...BY_PATH.keys()]
    .filter((path) => /^deployment\/gui\/[^/]+$/.test(path) && !/\.test\.tsx?$/.test(path))
    .map((path) => [path, null]);

  while (queue.length) {
    const [path, by] = queue.shift()!;
    if (reachedBy.has(path)) continue;
    reachedBy.set(path, by);

    const source = BY_PATH.get(path);
    if (!source) continue;
    for (const spec of loads(source)) {
      const resolved = resolveSpec(path, spec);
      if (resolved) queue.push([resolved, path]);
    }
  }
  return reachedBy;
}

describe('deployment boundary', () => {
  const reachedBy = deployedImports();
  const reachable = new Set(reachedBy.keys());
  /** How *path* is reached: each import on the way, from a file at the top of `deployment/gui/`. */
  const chain = (path: string): string => {
    const links = [path];
    for (let by = reachedBy.get(path); by; by = reachedBy.get(by)) links.unshift(by);
    return links.join(' → ');
  };
  const reaching = (found: (path: string) => boolean) => [...reachable].filter(found).map(chain);

  it('reaches the gui a deployed tool renders, and draws the gui it is handed from the halves that are delivered', () => {
    // A check on the walker itself: without it, the assertions below could pass
    // because nothing was found rather than because nothing is wrong.
    expect(BY_PATH.has('deployment/gui/main.tsx')).toBe(true);
    expect(reachable.has('deployment/gui/RuntimeApp.tsx')).toBe(true);
    expect(reachable.has('deployment/gui/surface/GuiSurface.tsx')).toBe(true);
    expect(reachable.size).toBeGreaterThan(10);
    expect(reachable.has('deployment/gui/surface/blocks.ts')).toBe(true);
    expect(reachable.has('deployment/gui/kit/api/session.ts')).toBe(true);
    expect([...reachable].some((path) => /WidgetView\.tsx$/.test(path))).toBe(true);
  });

  it('reaches nothing of the editor: no store, canvas, authoring or shell, no panel, no module for building a graph', () => {
    // Panels are registered with `lazy(() => import(…))`, which this walk --
    // like the bundler's static graph -- does not follow: a panel is a chunk
    // the editor fetches when an element is opened, and a tool never does.
    // Everything only the editor uses sits in a folder named `editor`.
    expect(reaching((path) => path.split('/').includes('editor'))).toEqual([]);
  });

  /**
   * graph/, gui/ and backend/, as far as a tool's gui loads them: the contract
   * (`host/api.ts`), and the shapes of a few values its views read -- a chat's
   * conversation, a dropdown's choice, a slider's range. Which blocks start a
   * round and which are given a value are the graph's events and values, which
   * the runtime API tells the gui by name.
   */
  it('loads of graph/, gui/ and backend/ only the contract and the shapes of the values its views read', () => {
    const loaded = [...reachable].filter((path) => /^(graph|gui|backend)\//.test(path));
    expect(loaded).toContain('backend/deployment/host/api.ts');
    const more = loaded.filter((path) => !/^(backend\/deployment\/host\/api\.ts|gui\/widgets\/[a-z_]+\/[a-z][A-Za-z]*\.ts)$/.test(path));
    expect(more.map(chain)).toEqual([]);
  });
});
