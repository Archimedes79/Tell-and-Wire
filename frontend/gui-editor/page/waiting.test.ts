import { describe, expect, it } from 'vitest';
import { WIDGET_BUILDERS } from '../../app/elements/registry';
import { blockStyle, gridStyle } from '../../app/document/layout';
import { BLOCKS } from './blocks';

/**
 * A block that shows what a run hands back is one line while it has nothing to
 * show, and the grid's rows are as tall as what is in them.
 */
describe('a block waiting for output', () => {
  const output = WIDGET_BUILDERS.text_io.create('summary', 'Summary', 'output');

  it('waits only while the box that only shows has nothing', () => {
    expect(BLOCKS.text_io.waits?.(output, '')).toBe(true);
    expect(BLOCKS.text_io.waits?.(output, undefined)).toBe(true);
    expect(BLOCKS.text_io.waits?.(output, 'A summary.')).toBe(false);
    // A box someone types into is a box, empty or not.
    expect(BLOCKS.text_io.waits?.(WIDGET_BUILDERS.text_io.create('ask', 'Ask', 'input'), '')).toBe(false);
  });

  it('stands as one row, and has its whole height once it has something', () => {
    const placement = { widget: output, w: 8, h: 5 };
    expect(blockStyle(placement, true).gridRow).toBe('span 1');
    expect(blockStyle(placement).gridRow).toBe('span 5');
    // A row is at least a cell and grows with what is in it: text is not cut.
    expect(gridStyle(56).gridAutoRows).toBe('minmax(56px, auto)');
  });
});
