import { describe, expect, it } from 'vitest';
import { WIDGET_BUILDERS } from '../document/elements/registry';
import { BLOCKS } from '../../deployment/gui/surface/blocks';

/**
 * What a block a person drops on a page looks like with no further choice: a
 * field or a button draws itself and has no card around it, what a run shows is
 * a card -- one frame each, never a box in a box.
 */
describe('the tone a new block has', () => {
  it('is no card for what is operated', () => {
    for (const [kind, mode] of [['input_picker', 'file'], ['select', undefined], ['slider', undefined], ['text_io', 'input'], ['button', undefined]] as const) {
      expect(WIDGET_BUILDERS[kind].create('x', 'X', mode).tone, kind).toBe('plain');
    }
  });

  it('is a card for what a run shows', () => {
    for (const [kind, mode] of [['text_io', 'output'], ['plot_window', undefined], ['table', undefined], ['image_view', undefined]] as const) {
      expect(WIDGET_BUILDERS[kind].create('x', 'X', mode).tone, kind).toBe('raised');
    }
  });
});

describe('where a bare block stands in its row', () => {
  it('has a heading of either level, and a rule, in the middle of its row, the rest the whole height', () => {
    for (const mode of ['h1', 'h2', 'heading']) {
      expect(BLOCKS.text.sits?.(WIDGET_BUILDERS.text.create('t', '', mode)), mode).toBe('center');
    }
    expect(BLOCKS.text.sits?.(WIDGET_BUILDERS.text.create('t', '', 'body'))).toBeUndefined();
    expect(BLOCKS.divider.sits?.(WIDGET_BUILDERS.divider.create('d', ''))).toBe('center');
    expect(BLOCKS.plot_window.sits).toBeUndefined();
  });
});

describe('the style of prose', () => {
  it('knows two levels of heading, and takes what a heading was called before there were two for the second', async () => {
    const { textRole, isHeadingRole } = await import('../../../gui/widgets/text/role.ts');
    expect(['h1', 'h2', 'heading', 'body', 'caption', 'nonsense', undefined].map(textRole)).toEqual(['h1', 'h2', 'h2', 'body', 'caption', 'body', 'body']);
    expect(['h1', 'h2', 'body', 'caption'].map((role) => isHeadingRole(role as never))).toEqual([true, true, false, false]);
  });
});
