import { LayoutTemplate } from 'lucide-react';
import { useGraphStore } from '../../app/store/graphStore';
import { SCHEMES, type SchemeId } from '../../app/ui/scheme';
import { DIMMER, FIELD_ON_SURFACE, MUTED } from '../../app/ui/theme';

/**
 * What the right panel shows while no block is selected: the page itself. One
 * choice for the whole page, from a closed set -- a block's `tone` says what
 * the block is, this says what the tool looks like. Every accent is picked to
 * sit on the same surfaces, so no combination can come out wrong.
 */
export default function PageSettings() {
  const scheme = useGraphStore((s) => s.metadata.gui_scheme);
  const setMetadata = useGraphStore((s) => s.setMetadata);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-xs font-medium" style={{ color: MUTED }}>
        <LayoutTemplate size={14} aria-hidden="true" /> Page
      </div>
      <label className="block">
        <span className="block text-xs font-medium mb-1" style={{ color: MUTED }}>Colour scheme</span>
        <select
          className="w-full rounded-lg px-2 py-1.5 text-sm"
          style={FIELD_ON_SURFACE}
          value={scheme}
          onChange={(event) => setMetadata({ gui_scheme: event.target.value as SchemeId })}
        >
          {SCHEMES.map((entry) => (
            <option key={entry.id} value={entry.id}>{entry.label}</option>
          ))}
        </select>
      </label>
      <p className="text-xs" style={{ color: DIMMER }}>
        Select a block on the page to change it, or press <kbd>/</kbd> to add one.
      </p>
    </div>
  );
}
