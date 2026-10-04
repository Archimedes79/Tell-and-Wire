import { describe, expect, it } from 'vitest';
import { WIDGET_BUILDERS } from '../../app/elements/registry';
import { ALL_ENTRIES, GROUPS } from './DesignerPalette';

const key = (kind: string, mode?: string) => `${kind}:${mode ?? ''}`;

describe('the page designer\'s palette', () => {
  it('stands every entry a kind offers in exactly one place, and nothing a kind does not offer', () => {
    // The entries are the kinds' own; the palette only places them. A kind
    // added without a place here would be missing from the page designer and
    // from "/" -- this says so instead.
    const offered = Object.entries(WIDGET_BUILDERS)
      .flatMap(([kind, builder]) => builder.paletteEntries().map((entry) => key(kind, entry.mode)))
      .sort();
    const placed = GROUPS.flatMap((group) => group.items.map((item) => key(item.kind, item.mode))).sort();
    expect(placed).toEqual(offered);
    expect(ALL_ENTRIES).toHaveLength(placed.length);
  });
});
