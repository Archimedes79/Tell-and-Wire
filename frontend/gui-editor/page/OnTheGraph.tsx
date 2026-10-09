import type { ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { GraphNode, GuiWidget } from '../../app/graph';
import { WIDGET_BUILDERS } from '../../app/elements/registry';
import { useGraphStore } from '../../app/store/graphStore';
import { blockCan, endPoints, memoryPoints, pageStartPoints, type Point } from '../../app/document/page';
import { connectToNewPoint } from './pageWrite';
import Chip from '../../app/ui/Chip';
import Toggle from '../../app/ui/Toggle';
import { DIMMER, EVENT, FIELD_ON_SURFACE, MUTED } from '../../app/ui/theme';

/** What a menu offers for a point made there and then. */
const NEW = '__new__';

/** One point as the graph names it and a person reads it. */
const named = (point: Point) => `${point.label && point.label !== point.id ? `${point.label} (${point.id})` : point.id}${point.memory ? ' · memory' : ''}`;
const nameOf = (points: Point[], id: string) => { const point = points.find((one) => one.id === id); return point ? named(point) : id; };

/** "+ Start point": one of the points not named yet, or a new one made for the block. */
function Adder({ label, options, onPick, onNew }: {
  label: string;
  options: Point[];
  onPick: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <select
      className="rounded-full px-2.5 py-0.5 text-xs"
      style={{ ...FIELD_ON_SURFACE, color: MUTED }}
      value=""
      aria-label={label}
      onChange={(event) => { if (event.target.value === NEW) onNew(); else if (event.target.value) onPick(event.target.value); }}
    >
      <option value="">+ {label}</option>
      {options.map((point) => <option key={point.id} value={point.id}>{named(point)}</option>)}
      <option value={NEW}>+ New {label.toLowerCase()}</option>
    </select>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div title={hint}>
      <div className="text-xs mb-1" style={{ color: DIMMER }}>{label}</div>
      {children}
    </div>
  );
}

/**
 * How the block meets the graph, by name -- nothing is wired to it: where its
 * data goes, whether using it starts a run, which end point or memory node it
 * shows. Only what the block can do is offered (`blockCan`, the runner's
 * answer), and only the points it may name: the start points the page starts,
 * the graph's end points and memory nodes. Most blocks arrive with all of it
 * set (`insertBlock` makes the points and names them); this is where it is
 * looked at, and changed.
 */
export default function OnTheGraph({ widget, onChange }: {
  widget: GuiWidget;
  onChange: (patch: Partial<GuiWidget>) => void;
}) {
  const nodes = useGraphStore(useShallow((s) => s.rfNodes.map((node) => node.data.graphNode as GraphNode)));
  const can = blockCan(widget);
  if (!can.sends && !can.fires && !can.shows) return null;

  const starts = pageStartPoints(nodes);
  // What a block shows: what the graph hands back, or what a memory node holds.
  const ends = [...endPoints(nodes), ...memoryPoints(nodes)];
  const sendsTo = widget.sends_to ?? [];
  const firesAt = widget.fires || null;

  return (
    <section
      aria-label="On the graph"
      className="flex flex-col gap-3 rounded-lg px-3 py-3"
      style={{ border: `1px solid color-mix(in srgb, ${EVENT} 40%, transparent)`, background: `color-mix(in srgb, ${EVENT} 5%, transparent)` }}
    >
      <h3 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: EVENT }}>On the graph</h3>

      {can.sends && (
        <Row label="Sends to" hint={`Sent as “${widget.id}” in the package of each: ${can.sends.description}.`}>
          <div className="flex flex-wrap items-center gap-1.5">
            {sendsTo.map((id) => (
              <Chip
                key={id}
                tone="event"
                removeLabel={`Stop sending to ${nameOf(starts, id)}`}
                onRemove={() => onChange({ sends_to: sendsTo.filter((one) => one !== id) })}
              >
                {nameOf(starts, id)}
              </Chip>
            ))}
            <Adder
              label="Start point"
              options={starts.filter((start) => !sendsTo.includes(start.id))}
              onPick={(id) => onChange({ sends_to: [...sendsTo, id] })}
              onNew={() => connectToNewPoint(widget.id, 'sends_to')}
            />
          </div>
        </Row>
      )}

      {can.fires && (
        // One start point: using the block either starts a run there or does not. With more, which one is a choice.
        <div title={WIDGET_BUILDERS[widget.kind].firesHint}>
          {starts.length > 1 ? (
            <label className="block">
              <span className="block text-xs mb-1" style={{ color: DIMMER }}>Starts a run at</span>
              <select
                className="w-full rounded-lg px-2 py-1.5 text-sm"
                style={FIELD_ON_SURFACE}
                value={firesAt ?? ''}
                onChange={(event) => { if (event.target.value === NEW) connectToNewPoint(widget.id, 'fires'); else onChange({ fires: event.target.value || null }); }}
              >
                <option value="">Nothing</option>
                {starts.map((start) => <option key={start.id} value={start.id}>⚡ {named(start)}</option>)}
                <option value={NEW}>+ New start point</option>
              </select>
            </label>
          ) : (
            <div className="flex items-center gap-3 text-sm">
              <Toggle
                on={!!firesAt}
                label="Starts a run"
                onChange={(on) => {
                  if (!on) onChange({ fires: null });
                  else if (starts[0]) onChange({ fires: starts[0].id });
                  else connectToNewPoint(widget.id, 'fires');
                }}
              />
              Starts a run
            </div>
          )}
        </div>
      )}

      {can.shows && (
        <Row label="Shows">
          {widget.shows ? (
            <Chip tone="event" removeLabel={`Stop showing ${nameOf(ends, widget.shows)}`} onRemove={() => onChange({ shows: null })}>
              {nameOf(ends, widget.shows)}
            </Chip>
          ) : (
            <Adder
              label="End point"
              options={ends}
              onPick={(id) => onChange({ shows: id })}
              onNew={() => connectToNewPoint(widget.id, 'shows')}
            />
          )}
        </Row>
      )}
    </section>
  );
}
