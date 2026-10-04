/**
 * The shells ask the element; they never switch on its name.
 *
 * Code outside the elements (`app/elements/`, `graph-editor/nodes/`,
 * `gui-editor/widgets/` and the fields their panels are made of) -- the canvas,
 * the page designer, the toolbar, the generation sweep -- may not compare a node's type or a widget's kind with a
 * literal. What such a comparison would decide belongs to the element's class
 * (`NodeGuiBuilder`, `WidgetGuiBuilder` and their subclasses), where a new kind answers for
 * itself and nothing shared has to change. The same rule holds in graph/,
 * where the executor asks `NodeRunner` and never names a type.
 */
import { describe, expect, it } from 'vitest';

const SOURCES = import.meta.glob('/{app,graph-editor,gui-editor}/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

const SHELLS = Object.entries(SOURCES)
  .filter(([path]) => !/^\/(app\/elements|app\/fields|graph-editor\/nodes|graph-editor\/fields|gui-editor\/widgets)\//.test(path) && !/\.test\.tsx?$/.test(path));

const TYPE_SWITCH = /\bnode_type\s*[!=]==?\s*['"]|\b(widget|block)\.kind\s*[!=]==?\s*['"]/;

describe('the shells', () => {
  it('are found, so the rule below is checked against something', () => {
    expect(SHELLS.length).toBeGreaterThan(30);
  });

  it('never compare a node type or a widget kind with a name', () => {
    const offending = SHELLS.flatMap(([path, source]) => source.split('\n')
      .map((line, index) => ({ line, at: `${path}:${index + 1}` }))
      .filter(({ line }) => TYPE_SWITCH.test(line) && !line.trim().startsWith('//') && !line.trim().startsWith('*'))
      .map(({ at, line }) => `${at}  ${line.trim()}`));
    expect(offending).toEqual([]);
  });
});
