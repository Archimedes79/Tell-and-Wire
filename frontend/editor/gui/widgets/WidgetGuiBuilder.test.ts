import { describe, it, expect } from 'vitest';
import type { WidgetKind } from '../../document/graph';
import { WIDGET_BUILDERS } from '../../elements/registry';

/** What every block holds: who it is, and how it is drawn. */
const COMMON = ['id', 'kind', 'label', 'mode', 'w', 'h', 'tone'];

/** What each kind keeps of its own, and reads. */
const OWN: Record<WidgetKind, string[]> = {
  text: ['value'],
  divider: [],
  spacer: [],
  input_picker: ['value', 'extensions', 'recursive'],
  text_io: ['value'],
  plot_window: [],
  image_view: [],
  table: [],
  select: ['options'],
  slider: ['min', 'max', 'step'],
  button: [],
  chat: [],
};

describe('a new block, as the palette puts it on a GUI', () => {
  it('holds only its own kind\'s settings', () => {
    // A divider or a chart carries no folder's file types and no options list.
    for (const [kind, builder] of Object.entries(WIDGET_BUILDERS) as [WidgetKind, (typeof WIDGET_BUILDERS)[WidgetKind]][]) {
      const extra = Object.keys(builder.create('block', 'Block')).filter((key) => !COMMON.includes(key) && !OWN[kind].includes(key));
      expect(extra, kind).toEqual([]);
    }
  });
});
