import { Suspense } from 'react';
import type { GuiWidget } from '../../app/graph';
import { WIDGET_BUILDERS } from '../../app/elements/registry';
import { entryOf } from './DesignerPalette';
import OnTheGraph from './OnTheGraph';
import { GUI_GRID_COLUMNS } from '../../app/document/layout';
import { TONES, TONE_LABELS, type Tone } from '../../app/ui/tone';
import Button from '../../app/ui/Button';
import { DIMMER, FIELD_ON_SURFACE, LINE, MUTED } from '../../app/ui/theme';

interface WidgetEditorProps {
  widget: GuiWidget;
  onChange: (patch: Partial<GuiWidget>) => void;
}

/**
 * What the widget selected on the designer canvas *is*: its label, how it
 * meets the graph (`OnTheGraph`), its own settings drawn by its own panel, and
 * how it looks. A block has no body to write: a chart, a table or an image says
 * in one sentence what it shows, and what reshapes a value is a node.
 *
 * The canvas owns arrangement; this owns identity, and only for the one widget
 * in hand -- not a second editable list of every widget beside the canvas.
 * Same shape as a node's config panel one level down, which is why it draws
 * the element's own `Panel` rather than knowing any widget kind.
 */
export default function WidgetEditor({ widget, onChange }: WidgetEditorProps) {
  const element = WIDGET_BUILDERS[widget.kind];
  const Panel = element.Panel;
  const entry = entryOf(widget.kind, widget.mode);
  const Icon = entry?.icon;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-xs font-medium" style={{ color: MUTED }}>
        {Icon && <Icon size={14} aria-hidden="true" />}
        {entry?.label ?? element.label}
      </div>

      <label className="block">
        <span className="block text-xs font-medium mb-1" style={{ color: MUTED }}>Label</span>
        <input
          className="w-full rounded-lg px-2 py-1.5 text-sm"
          style={FIELD_ON_SURFACE}
          value={widget.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="What it says above the block"
        />
      </label>

      <OnTheGraph widget={widget} onChange={onChange} />

      {/* A panel is its own chunk, loaded when a widget is first opened.
          Keyed by the block: what one block's panel holds -- a listing -- is
          not shown in the next block selected. */}
      {Panel && (
        <Suspense fallback={null}>
          <Panel key={widget.id} builder={element} widget={widget} onUpdate={onChange} />
        </Suspense>
      )}

      {/* Everything that is a preference rather than a decision: how it looks,
          its exact size. Folded, because a block is finished without any of
          it -- the page used to open on these. */}
      <details className="rounded-lg" style={{ border: `1px solid ${LINE}` }}>
        <summary className="px-3 py-2 text-xs font-medium cursor-pointer select-none" style={{ color: MUTED }}>
          Look & size
        </summary>
        <div className="px-3 pb-3 pt-1">
          {/* A closed set, not a colour picker: every value comes from the one
              palette, so no combination can look wrong. */}
          <label className="block mb-2">
            <span className="block text-xs font-medium mb-1" style={{ color: MUTED }}>Style</span>
            <select
              className="w-full rounded-lg px-2 py-1.5 text-sm"
              style={FIELD_ON_SURFACE}
              value={(widget.tone as Tone) ?? 'raised'}
              onChange={(e) => onChange({ tone: e.target.value as Tone })}
            >
              {TONES.map((tone) => (
                <option key={tone} value={tone}>{TONE_LABELS[tone]}</option>
              ))}
            </select>
          </label>

          {/* On top of the style: a frame or not, and a colour of your own. Unset
              means the style decides, which is what "Default" puts back. */}
          <div className="flex items-center gap-4 mb-3 text-xs" style={{ color: MUTED }}>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={widget.border ?? widget.tone !== 'plain'}
                onChange={(e) => onChange({ border: e.target.checked })}
              />
              Frame
            </label>
            <label className="flex items-center gap-2">
              Background
              <input
                type="color"
                value={widget.background || '#000000'}
                onChange={(e) => onChange({ background: e.target.value })}
                title={widget.background || 'Decided by the style'}
              />
            </label>
            {(widget.border !== undefined || widget.background) && (
              <Button variant="quiet" size="sm" onClick={() => onChange({ border: undefined, background: '' })}>
                Default
              </Button>
            )}
          </div>

          {/* Exact cells, for when ¼ ½ ¾ on the block is not the size wanted. */}
          <div className="flex items-center gap-3">
            {([['w', 'Width', GUI_GRID_COLUMNS], ['h', 'Height', 99]] as const).map(([field, label, max]) => (
              <label key={field} className="flex items-center gap-1 text-xs" style={{ color: DIMMER }}>
                {label}
                <input
                  type="number"
                  min={1}
                  max={max}
                  className="w-14 rounded px-1 py-0.5 text-xs"
                  style={FIELD_ON_SURFACE}
                  value={(widget[field] as number) ?? 1}
                  onChange={(e) => onChange({ [field]: Math.max(1, Math.min(max, Number(e.target.value) || 1)) })}
                />
              </label>
            ))}
            <span className="text-xs" style={{ color: DIMMER }}>cells of {GUI_GRID_COLUMNS}</span>
          </div>
        </div>
      </details>
    </div>
  );
}
