/**
 * The faces of every element describe the same kinds: file for file, name for
 * name, and class hierarchy for class hierarchy.
 *
 * A node kind has four faces, each in a folder of the same name -- the
 * definition (`graph/nodes/<kind>/`), the runner (`backend/deployment/runtime/nodes/<kind>/`),
 * the design (`graph/authoring/nodes/<kind>/`) and the builder (`frontend/editor/graph/nodes/<kind>/`)
 * --, and a widget kind a definition (`gui/widgets/<kind>/`), a design where it
 * has something of its own to say (`gui/authoring/widgets/<kind>/`), a builder
 * (`frontend/editor/gui/widgets/<kind>/`) and a view. The builder's inheritance
 * mirrors the definition's, level for level:
 *
 *   PlotWindowWidgetDefinition → DisplayWidgetDefinition → WidgetDefinition → ElementDefinition
 *   PlotWindowWidgetGuiBuilder → DisplayWidgetGuiBuilder → WidgetGuiBuilder → ElementGuiBuilder
 *
 * and the registries list the same kinds. A new element with a face missing --
 * or one filed, named or derived some other way -- is a failure here rather
 * than a blank panel, a node nobody can run or a widget missing on someone's gui.
 */
import { describe, expect, it } from 'vitest';
import type { NodeType } from '../graph';
import { registry } from '../../../../graph/nodes/registry.ts';
import { designs } from '../../../../graph/authoring/nodes/registry.ts';
import { runners } from '../../../../backend/deployment/runtime/nodes/registry.ts';
import { WIDGETS } from '../../../../gui/widgets/roster.ts';
import { widgetElement } from '../../../../gui/gui.ts';
import { WidgetDesign } from '../../../../gui/authoring/widgets/WidgetDesign.ts';
import { widgetDesign } from '../../../../gui/authoring/widgets/roster.ts';
import { NODE_BUILDERS, WIDGET_BUILDERS } from './registry';

type Exports = Record<string, Record<string, unknown>>;

/** The modules of one face, by their path under the folder that holds the kinds: `<kind>/<File>.ts`. Only the class files -- never a test, which must not run here. */
const faces = (modules: Record<string, unknown>, root: string): Exports =>
  Object.fromEntries(Object.entries(modules).map(([path, module]) => [path.slice(path.indexOf(root) + root.length), module])) as Exports;

const DEFINITIONS = faces(import.meta.glob('../../../../graph/nodes/*/*NodeDefinition.ts', { eager: true }), 'graph/nodes/');
const RUNNERS = faces(import.meta.glob('../../../../backend/deployment/runtime/nodes/*/*NodeRunner.ts', { eager: true }), 'runtime/nodes/');
const DESIGNS = faces(import.meta.glob('../../../../graph/authoring/nodes/*/*NodeDesign.ts', { eager: true }), 'authoring/nodes/');
const NODE_GUI_BUILDERS = faces(import.meta.glob('../../graph/nodes/*/*NodeGuiBuilder.ts', { eager: true }), 'graph/nodes/');
const WIDGET_DESIGNS = faces(import.meta.glob('../../../../gui/authoring/widgets/*/*WidgetDesign.ts', { eager: true }), 'authoring/widgets/');
const WIDGET_GUI_BUILDERS = faces(import.meta.glob('../../gui/widgets/*/*GuiBuilder.ts', { eager: true }), 'gui/widgets/');
/** Every file under a kind's folder, in the definitions of widgets and in the two places a widget's browser half lives. */
const WIDGET_DEFINITION_FILES = Object.keys(import.meta.glob('../../../../gui/widgets/*/*.ts'));
const WIDGET_EDITOR_FILES = Object.keys({
  ...import.meta.glob('../../gui/widgets/*/*.{ts,tsx}'),
  ...import.meta.glob('../../../deployment/gui/widgets/*/*.tsx'),
});

const pascal = (kind: string) => kind.split('_').map((word) => word[0].toUpperCase() + word.slice(1)).join('');
const folders = (paths: string[], root: string) => [...new Set(paths.map((path) => path.slice(path.indexOf(root) + root.length).split('/')[0]))].sort();

/** An object's class and every class above it, most specific first. */
function lineage(instance: object): string[] {
  const names: string[] = [];
  for (let proto = Object.getPrototypeOf(instance); proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
    names.push(proto.constructor.name);
  }
  return names;
}

const mirrored = (definition: string[]) => definition.map((name) => name.replace(/Definition$/, 'GuiBuilder'));

describe('the faces of every element', () => {
  it('are registered for the same node types and widget kinds', () => {
    const types = [...registry.nodeTypes()].sort();
    expect(Object.keys(NODE_BUILDERS).sort()).toEqual(types);
    for (const type of types) {
      expect(runners.node(type), `runner of ${type}`).toBeDefined();
      expect(designs.node(type), `design of ${type}`).toBeDefined();
    }
    expect(Object.keys(WIDGET_BUILDERS).sort()).toEqual(WIDGETS.map((element) => element.widgetKind).sort());
  });

  it('are, for every node type, <Kind>NodeDefinition, <Kind>NodeRunner, <Kind>NodeDesign and <Kind>NodeGuiBuilder, each in the folder of its face, the builder in mirrored classes', () => {
    for (const kind of registry.nodeTypes()) {
      const name = `${pascal(kind)}Node`;
      const definition = registry.node(kind)!;
      const runner = runners.node(kind)!;
      const builder = NODE_BUILDERS[kind as NodeType];
      expect(DEFINITIONS[`${kind}/${name}Definition.ts`]?.[`${name}Definition`], `node ${kind}`).toBe(definition.constructor);
      expect(RUNNERS[`${kind}/${name}Runner.ts`]?.[`${name}Runner`], `node ${kind}`).toBe(runner.constructor);
      expect(DESIGNS[`${kind}/${name}Design.ts`]?.[`${name}Design`], `node ${kind}`).toBe(designs.node(kind)!.constructor);
      expect(NODE_GUI_BUILDERS[`${kind}/${name}GuiBuilder.ts`]?.[`${name}GuiBuilder`], `node ${kind}`).toBe(builder.constructor);
      // The runner is made of the definition the registry lists, not of one of its own.
      expect(runner.kind, `node ${kind}`).toBe(definition);
      expect(lineage(builder), `node ${kind}`).toEqual(mirrored(lineage(definition)));
    }
  });

  it('are, for every widget kind, <Kind>WidgetDefinition, <Kind>WidgetDesign (or the default), <Kind>WidgetGuiBuilder and <Kind>WidgetView, the builder in mirrored classes', () => {
    for (const { widgetKind: kind } of WIDGETS) {
      const name = `${pascal(kind)}Widget`;
      const definition = widgetElement(kind)!;
      const builder = WIDGET_BUILDERS[kind as keyof typeof WIDGET_BUILDERS];
      expect(WIDGET_DEFINITION_FILES.some((path) => path.endsWith(`/widgets/${kind}/${name}Definition.ts`)), `widget ${kind}`).toBe(true);
      expect(widgetDesign(kind)?.constructor, `widget ${kind}`).toBe(WIDGET_DESIGNS[`${kind}/${name}Design.ts`]?.[`${name}Design`] ?? WidgetDesign);
      expect(WIDGET_GUI_BUILDERS[`${kind}/${name}GuiBuilder.ts`]?.[`${name}GuiBuilder`], `widget ${kind}`).toBe(builder.constructor);
      expect(WIDGET_EDITOR_FILES.some((path) => path.endsWith(`/widgets/${kind}/${name}View.tsx`)), `widget ${kind}`).toBe(true);
      expect(lineage(builder), `widget ${kind}`).toEqual(mirrored(lineage(definition)));
    }
  });

  it('have no element folder on one side only', () => {
    const nodes = folders(Object.keys(DEFINITIONS), '');
    for (const [face, modules] of Object.entries({ runners: RUNNERS, designs: DESIGNS, builders: NODE_GUI_BUILDERS })) {
      expect(folders(Object.keys(modules), ''), `${face} of nodes`).toEqual(nodes);
    }
    expect(folders(WIDGET_EDITOR_FILES, '/widgets/')).toEqual(folders(WIDGET_DEFINITION_FILES, '/widgets/'));
    for (const kind of folders(Object.keys(WIDGET_DESIGNS), '')) expect(folders(WIDGET_DEFINITION_FILES, '/widgets/'), `design of widget ${kind}`).toContain(kind);
  });
});
