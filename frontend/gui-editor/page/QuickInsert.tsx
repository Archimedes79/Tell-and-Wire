import { ALL_ENTRIES, matchesEntry, type PaletteEntry } from './DesignerPalette';
import QuickPick from '../../app/ui/QuickPick';

/**
 * "/" on the page: type what you want, press Enter, keep going.
 *
 * The palette is for finding out what exists. This is for when you know --
 * `/` `but` `Enter` puts a button where you were, without the hand leaving the
 * keyboard or the eye leaving the page. It is the one thing every document
 * editor people call easy has in common, and it searches by what people call
 * things ("run" finds the button, "title" the heading) rather than by our names
 * for them. The menu itself is `app/ui/QuickPick`; this hands it the blocks.
 */
export default function QuickInsert({ onPick, onClose }: {
  onPick: (entry: PaletteEntry) => void;
  onClose: () => void;
}) {
  return (
    <QuickPick
      entries={ALL_ENTRIES}
      keyOf={(entry) => `${entry.kind}:${entry.mode ?? ''}`}
      match={matchesEntry}
      onPick={onPick}
      onClose={onClose}
      label="Search blocks"
      placeholder="Add a block… heading, button, chart"
      style={{ gridColumn: 'span 16', justifySelf: 'start' }}
    />
  );
}
