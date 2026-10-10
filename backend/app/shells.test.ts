/**
 * The shells around the elements ask the element; they never switch on its name.
 *
 * The executor, the project folder, `check`, the server and the CLI may not
 * compare a node's type with a literal. What such a comparison would decide is a
 * member of the element's class (`isResult`, `takesPackage`, `problems`,
 * `readsFileInputs`), so a new kind answers for itself and nothing shared has to
 * change. The editor holds the same line in `frontend/app/elements/shells.test.ts`.
 *
 * One file is allowed to read the document without asking: `graph/execution/triggers.ts`
 * lists a graph's start points that start themselves, from the file alone.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/** The repository: the shells are graph/ and backend/, the elements graph/nodes/ and backend/gui-editor/widgets/. */
const ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const ELEMENTS = ['graph/nodes/', 'backend/gui-editor/widgets/'];
const TYPE_SWITCH = /\b(node_type|nodeType)\s*[!=]==?\s*['"]/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules') return [];
    return statSync(path).isDirectory() ? sources(path) : [path];
  });
}

const SHELLS = [...sources(join(ROOT, 'graph')), ...sources(join(ROOT, 'backend'))]
  .map((path) => ({ path, name: relative(ROOT, path).split(sep).join('/') }))
  .filter(({ name }) => /\.ts$/.test(name) && !/\.test\.ts$/.test(name) && !ELEMENTS.some((element) => name.startsWith(element)));

describe('the shells around the elements', () => {
  it('are found, so the rule below is checked against something', () => {
    expect(SHELLS.length).toBeGreaterThan(30);
  });

  it('never compare a node type with a name', () => {
    const offending = SHELLS.flatMap(({ path, name }) => readFileSync(path, 'utf8').split('\n')
      .map((line, index) => ({ line, at: `${name}:${index + 1}` }))
      .filter(({ line }) => TYPE_SWITCH.test(line.replace(/typeof\s+\S+/g, '')) && !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .map(({ at, line }) => `${at}  ${line.trim()}`));
    expect(offending).toEqual([]);
  });
});

describe('the graph\'s code', () => {
  it('imports nothing from backend/ or frontend/: a core in another language is a graph/ of its own', () => {
    const graph = sources(join(ROOT, 'graph')).filter((path) => /\.ts$/.test(path) && !/\.test\.ts$/.test(path) && !path.includes(`${sep}test${sep}`));
    const reaching = graph.flatMap((path) => [...readFileSync(path, 'utf8').matchAll(/(?:from|import\()\s*'(\.[^']+)'/g)]
      .map((match) => relative(ROOT, join(path, '..', match[1])).split(sep).join('/'))
      .filter((target) => !target.startsWith('graph/'))
      .map((target) => `${relative(ROOT, path).split(sep).join('/')} -> ${target}`));
    expect(reaching).toEqual([]);
  });
});
