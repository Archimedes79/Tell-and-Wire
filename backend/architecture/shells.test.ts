/**
 * The shells around the elements ask the element; they never switch on its name.
 *
 * The executor, the project folder, `check`, the server and the CLI may not
 * compare a node's type with a literal. What such a comparison would decide is a
 * member of the element's classes (`isResult`, `takesPackage`, `problems`,
 * `readsFileInputs`), so a new kind answers for itself and nothing shared has to
 * change. The editor holds the same line in `frontend/editor/document/elements/shells.test.ts`.
 *
 * One file is allowed to read the document without asking: `graph/triggers.ts`
 * lists a graph's start points that start themselves, from the file alone.
 */
import { readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { filesUnder } from './filesUnder.ts';

/** The repository: the shells are graph/, gui/ and backend/, the elements the folders of the nodes' and widgets' definitions, runners and designs. */
const ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const ELEMENTS = ['graph/nodes/', 'graph/authoring/nodes/', 'backend/deployment/runtime/nodes/', 'gui/widgets/', 'gui/authoring/widgets/'];
const TYPE_SWITCH = /\b(node_type|nodeType)\s*[!=]==?\s*['"]/;

const SHELLS = [...filesUnder(join(ROOT, 'graph')), ...filesUnder(join(ROOT, 'gui')), ...filesUnder(join(ROOT, 'backend'))]
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
