import { describe, expect, it } from 'vitest';
import { WIDGET_BUILDERS } from '../../app/elements/registry';
import { BLOCKS } from './blocks';

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
  it('has a heading on the bottom, a rule in the middle, the rest the whole height', () => {
    expect(BLOCKS.text.sits?.(WIDGET_BUILDERS.text.create('t', '', 'heading'))).toBe('end');
    expect(BLOCKS.text.sits?.(WIDGET_BUILDERS.text.create('t', '', 'body'))).toBeUndefined();
    expect(BLOCKS.divider.sits?.(WIDGET_BUILDERS.divider.create('d', ''))).toBe('center');
    expect(BLOCKS.plot_window.sits).toBeUndefined();
  });
});
