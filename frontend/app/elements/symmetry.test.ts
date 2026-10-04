/**
 * The runners and the page describe the same elements: file for file, name
 * for name, and class hierarchy for class hierarchy.
 *
 * Every element is a folder under the same name on both sides -- nodes/<kind>/ in
 * graph/ and frontend/graph-editor/, widgets/<kind>/ in backend/gui-editor/ and
 * frontend/gui-editor/ -- and its
 * two halves are a pair of classes -- a `Runner` that runs it, a
 * `GuiBuilder` in the page that builds it -- whose inheritance mirrors, level for level:
 *
 *   PlotWindowWidgetRunner     → DisplayWidgetRunner     → WidgetRunner     → ElementRunner
 *   PlotWindowWidgetGuiBuilder → DisplayWidgetGuiBuilder → WidgetGuiBuilder → ElementGuiBuilder
 *
 * and the two registries list the same kinds. A new element with only one
 * half -- or a half filed, named or derived some other way -- is a failure
 * here rather than a blank panel or a missing widget on someone's page.
 */
import { describe, expect, it } from 'vitest';
import { registry } from '../../../graph/nodes/registry.ts';
import { WIDGETS } from '../../../backend/gui-editor/widgets/roster.ts';
import { widgetElement } from '../../../backend/gui-editor/widgets/page.ts';
import { NODE_BUILDERS, WIDGET_BUILDERS } from './registry';

/** Each half by the path under its part: nodes/<kind>/… in the graph and the graph editor, widgets/<kind>/… in the Gui editor's two halves. */
const under = (paths: string[], parts: string[]) => paths.map((path) => parts.reduce((left, part) => left.replace(part, ''), path));
const RUNNERS = under(Object.keys({ ...import.meta.glob('../../../graph/nodes/*/*.ts'), ...import.meta.glob('../../../backend/gui-editor/widgets/*/*.ts') }),
  ['../../../graph/', '../../../backend/gui-editor/']);
const EDITOR = under(Object.keys({ ...import.meta.glob('../../graph-editor/nodes/*/*.{ts,tsx}'), ...import.meta.glob('../../gui-editor/widgets/*/*.{ts,tsx}') }),
  ['../../graph-editor/', '../../gui-editor/']);
/** Every editor half, as its module exports it -- loaded one by one, in no order the registry chose. */
const BUILDER_MODULES = Object.fromEntries(Object.entries({
  ...import.meta.glob('../../graph-editor/nodes/*/*GuiBuilder.ts', { eager: true }),
  ...import.meta.glob('../../gui-editor/widgets/*/*GuiBuilder.ts', { eager: true }),
}).map(([path, module]) => [`./${under([path], ['../../graph-editor/', '../../gui-editor/'])[0]}`, module])) as Record<string, Record<string, unknown>>;

const pascal = (kind: string) => kind.split('_').map((word) => word[0].toUpperCase() + word.slice(1)).join('');

/** An object's class and every class above it, most specific first. */
function lineage(instance: object): string[] {
  const names: string[] = [];
  for (let proto = Object.getPrototypeOf(instance); proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
    names.push(proto.constructor.name);
  }
  return names;
}

const mirrored = (runnerLineage: string[]) => runnerLineage.map((name) => name.replace(/Runner$/, 'GuiBuilder'));

describe('the two halves of every element', () => {
  it('are registered for the same node types and widget kinds', () => {
    expect(Object.keys(NODE_BUILDERS).sort()).toEqual([...registry.nodeTypes()].sort());
    expect(Object.keys(WIDGET_BUILDERS).sort()).toEqual(WIDGETS.map((element) => element.widgetKind).sort());
  });

  it('are, for every node type, <Kind>NodeRunner in graph/ and <Kind>NodeGuiBuilder in the editor, in mirrored classes', () => {
    for (const kind of registry.nodeTypes()) {
      const name = `${pascal(kind)}Node`;
      const element = registry.node(kind)!;
      const builder = NODE_BUILDERS[kind as keyof typeof NODE_BUILDERS];
      expect(RUNNERS, `node ${kind}`).toContain(`nodes/${kind}/${name}Runner.ts`);
      expect(BUILDER_MODULES[`./nodes/${kind}/${name}GuiBuilder.ts`]?.[`${name}GuiBuilder`], `node ${kind}`).toBe(builder.constructor);
      expect(lineage(builder), `node ${kind}`).toEqual(mirrored(lineage(element)));
    }
  });

  it('are, for every widget kind, <Kind>WidgetRunner, <Kind>WidgetGuiBuilder and <Kind>WidgetView, in mirrored classes', () => {
    for (const { widgetKind: kind } of WIDGETS) {
      const name = `${pascal(kind)}Widget`;
      const element = widgetElement(kind)!;
      const builder = WIDGET_BUILDERS[kind as keyof typeof WIDGET_BUILDERS];
      expect(RUNNERS, `widget ${kind}`).toContain(`widgets/${kind}/${name}Runner.ts`);
      expect(BUILDER_MODULES[`./widgets/${kind}/${name}GuiBuilder.ts`]?.[`${name}GuiBuilder`], `widget ${kind}`).toBe(builder.constructor);
      expect(EDITOR, `widget ${kind}`).toContain(`widgets/${kind}/${name}View.tsx`);
      expect(lineage(builder), `widget ${kind}`).toEqual(mirrored(lineage(element)));
    }
  });

  it('has no element folder on one side only', () => {
    const folders = (paths: string[]) => new Set(paths.map((path) => path.split('/').slice(0, 2).join('/')));
    expect([...folders(EDITOR)].sort()).toEqual([...folders(RUNNERS)].sort());
  });
});
