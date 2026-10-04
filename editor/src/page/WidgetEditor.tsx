import { Suspense } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { GraphNode, GuiWidget } from '@/graph';
import { WIDGET_BUILDERS } from '@/elements/registry';
import { useGraphStore } from '@/store/graphStore';
import { blockCan, endPoints, pageStartPoints, type Point } from '@/document/page';
import { connectToNewPoint } from './pageWrite';
import { GUI_GRID_COLUMNS } from '@/document/layout';
import { TONES, TONE_LABELS, type Tone } from '@/ui/tone';
import { DANGER, DIMMER, FIELD_ON_SURFACE, LINE, MUTED, WELL } from '@/ui/theme';

interface WidgetEditorProps {
  widget: GuiWidget | null;
  onChange: (patch: Partial<GuiWidget>) => void;
  /** Remove this block from the page. Dragging is what arranges it. */
  onRemove?: () => void;
}

/** What a select offers for a point made there and then: "+ New start point". */
const NEW = '__new__';

/** One point to choose, as the graph names it and a person reads it. */
const named = (point: Point) => (point.label && point.label !== point.id ? `${point.label} (${point.id})` : point.id);

/**
 * How the block connects to the graph -- by name, since nothing is wired to
 * it: where its data goes, which start point using it fires, which end point
 * it shows. Only what the block can do is offered (`blockCan`, the engine's
 * answer), and only the points it may name: the start points the page starts,
 * the graph's end points. A point it needs and the graph lacks is one choice
 * away, made beside the rest of the canvas.
 */
function Connections({ widget, onChange }: { widget: GuiWidget; onChange: (patch: Partial<GuiWidget>) => void }) {
  const nodes = useGraphStore(useShallow((s) => s.rfNodes.map((node) => node.data.graphNode as GraphNode)));
  const can = blockCan(widget);
  if (!can.sends && !can.fires && !can.shows) return null;
  const starts = pageStartPoints(nodes);
  const ends = endPoints(nodes);
  const sendsTo = widget.sends_to ?? [];
  const hint = WIDGET_BUILDERS[widget.kind].firesHint;
  const choose = (value: string, as: 'fires' | 'shows') => {
    if (value === NEW) connectToNewPoint(widget.id, as);
    else onChange({ [as]: value || null });
  };

  return (
    <div className="mb-3 flex flex-col gap-3">
      {can.sends && (
        <div>
          <span className="block text-xs font-medium mb-1" style={{ color: MUTED }}>Its data goes to</span>
          {starts.map((start) => (
            <label key={start.id} className="flex items-center gap-2 text-xs" style={{ color: MUTED }}>
              <input
                type="checkbox"
                checked={sendsTo.includes(start.id)}
                onChange={(e) => onChange({
                  sends_to: e.target.checked ? [...sendsTo, start.id] : sendsTo.filter((id) => id !== start.id),
                })}
              />
              {named(start)}
            </label>
          ))}
          <button type="button" className="text-xs underline mt-1" style={{ color: DIMMER }} onClick={() => connectToNewPoint(widget.id, 'sends_to')}>
            + New start point
          </button>
          <p className="text-xs mt-1" style={{ color: DIMMER }}>
            Sent as “{widget.id}” in the package of each: {can.sends?.description}.
          </p>
        </div>
      )}

      {can.fires && (
        <label className="block">
          <span className="block text-xs font-medium mb-1" style={{ color: MUTED }}>Using it fires</span>
          <select
            className="w-full rounded-lg px-2 py-1.5 text-sm"
            style={FIELD_ON_SURFACE}
            value={widget.fires ?? ''}
            onChange={(e) => choose(e.target.value, 'fires')}
          >
            <option value="">Nothing</option>
            {starts.map((start) => <option key={start.id} value={start.id}>⚡ {named(start)}</option>)}
            <option value={NEW}>+ New start point</option>
          </select>
          {widget.fires && <p className="text-xs mt-1" style={{ color: DIMMER }}>{hint}</p>}
        </label>
      )}

      {can.shows && (
        <label className="block">
          <span className="block text-xs font-medium mb-1" style={{ color: MUTED }}>It shows</span>
          <select
            className="w-full rounded-lg px-2 py-1.5 text-sm"
            style={FIELD_ON_SURFACE}
            value={widget.shows ?? ''}
            onChange={(e) => choose(e.target.value, 'shows')}
          >
            <option value="">Nothing</option>
            {ends.map((end) => <option key={end.id} value={end.id}>{named(end)}</option>)}
            <option value={NEW}>+ New end point</option>
          </select>
        </label>
      )}
    </div>
  );
}

/**
 * What the widget selected on the designer canvas *is*: its label, how it
 * connects to the graph, its own settings drawn by its own panel, and how it
 * looks. A block has no body to write: a chart, a table or an image says in
 * one sentence what it shows, and what reshapes a value is a node.
 *
 * The canvas owns arrangement; this owns identity, and only for the one widget
 * in hand -- not a second editable list of every widget beside the canvas.
 * Same shape as a node's config panel one level down, which is why it draws
 * the element's own `Panel` rather than knowing any widget kind.
 */
export default function WidgetEditor({ widget, onChange, onRemove }: WidgetEditorProps) {
  if (!widget) {
    return (
      <p className="text-xs" style={{ color: DIMMER }}>
Select a block on the page — or press <kbd>/</kbd> to add one.
      </p>
    );
  }

  const element = WIDGET_BUILDERS[widget.kind];
  const Panel = element.Panel;

  return (
    <div className="px-3 py-3 rounded-lg" style={WELL}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: '#2d1b4e', color: '#c4b5fd' }}>
          {element.label}
        </span>
        <span className="flex-1" />
        <button
          onClick={onRemove}
          className="text-xs px-2 py-1 rounded"
          style={{ background: DANGER, color: 'white' }}
          title="Remove (Del)"
          aria-label="Remove"
        >
          ✕
        </button>
      </div>

      <label className="block mb-3">
        <span className="block text-xs font-medium mb-1" style={{ color: MUTED }}>Label</span>
        <input
          className="w-full rounded-lg px-2 py-1.5 text-sm"
          style={FIELD_ON_SURFACE}
          value={widget.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="What it says above the block"
        />
      </label>

      <Connections widget={widget} onChange={onChange} />

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
      <details className="mt-3 rounded-lg" style={{ border: `1px solid ${LINE}` }}>
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
              <button type="button" className="text-xs underline" onClick={() => onChange({ border: undefined, background: '' })}>
                Default
              </button>
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
