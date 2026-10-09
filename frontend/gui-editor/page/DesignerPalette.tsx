import React, { useState } from 'react';
import type { GuiWidget, WidgetKind } from '../../app/graph';
import { WIDGET_BUILDERS } from '../../app/elements/registry';
import { freeId } from '../../app/document/ids';
import type { PaletteEntry as KindEntry } from '../widgets/WidgetGuiBuilder';
import { Wand2 } from 'lucide-react';
import Button from '../../app/ui/Button';
import { DIMMER, LINE, SURFACE } from '../../app/ui/theme';

/**
 * The element palette, in the same place and the same look as the node palette
 * on the graph tab (`.palette-tile`): a slim column on the left, click or drag
 * to add. The two share a look and no code.
 *
 * Grouped the way a page is built rather than by implementation: the words that
 * hold a page together, the things a person operates, the things a run fills in.
 *
 * An entry is a **kind plus a mode**, not just a kind. "Heading" and "Text" are
 * both `text` -- they hold the same string and connect the same way -- so
 * they are one element with two formats, and the palette is where that
 * distinction belongs: in front of the person choosing, not in the type system
 * behind them.
 *
 * What most pages are made of is on top; what a few pages need is under "More",
 * folded. Seventeen entries in a column was a list to read before starting,
 * and seven of them were ways to draw a line or leave a gap.
 */
export interface PaletteEntry extends KindEntry {
  kind: WidgetKind;
}

/**
 * Where each entry stands: the palette's layout, and only that. What an entry
 * is called, its icon and the words it is found by are its kind's
 * (`WidgetGuiBuilder.paletteEntries`), the way the node palette takes its
 * words from the node builders; the order here cuts across kinds -- a heading
 * under Words, a caption under More -- so it is kept in one place.
 */
export const GROUPS: { label: string; folded?: boolean; items: { kind: WidgetKind; mode?: string }[] }[] = [
  {
    label: 'Words',
    items: [{ kind: 'text', mode: 'heading' }, { kind: 'text', mode: 'body' }, { kind: 'divider', mode: 'horizontal' }],
  },
  {
    label: 'The person does',
    items: [
      { kind: 'chat' }, { kind: 'input_picker' }, { kind: 'text_io', mode: 'input' },
      { kind: 'select' }, { kind: 'slider' }, { kind: 'button' },
    ],
  },
  {
    label: 'The graph shows',
    items: [{ kind: 'text_io', mode: 'output' }, { kind: 'table' }, { kind: 'plot_window' }, { kind: 'image_view' }],
  },
  {
    label: 'More',
    folded: true,
    items: [
      { kind: 'text', mode: 'caption' }, { kind: 'text_io', mode: 'both' }, { kind: 'divider', mode: 'vertical' },
      { kind: 'spacer', mode: 'horizontal' }, { kind: 'spacer', mode: 'vertical' },
    ],
  },
];

/** The kind's own entry for *mode*: the one without a mode stands for the kind's default. */
export function entryOf(kind: WidgetKind, mode?: string): PaletteEntry | undefined {
  const entry = WIDGET_BUILDERS[kind]?.paletteEntries().find((candidate) => (candidate.mode ?? '') === (mode ?? ''));
  return entry && { ...entry, kind };
}

/**
 * The block an entry adds to a page that holds the blocks *taken*.
 *
 * A block that connects to the graph starts out named after what it is: a
 * start point's card says which blocks fire it and send to it by their names,
 * and an unnamed one there reads as nothing. Whether a kind is named at all is
 * its builder's answer. Beside a block of that name it is numbered, as a node
 * is: two "Text output" blocks could not be told apart in the block settings.
 */
export function newBlock(kind: WidgetKind, mode: string | undefined, taken: GuiWidget[]): GuiWidget {
  const builder = WIDGET_BUILDERS[kind];
  const entry = entryOf(kind, mode) ?? builder.paletteEntries()[0];
  // Named for what it is: its id is what its data is sent under, `text_io`.
  const named = builder.initialLabel(entry?.label ?? '');
  const label = named && freeId(named, taken.map((block) => block.label), ' ');
  return builder.create(freeId(kind, taken.map((block) => block.id)), label, mode);
}

const PALETTE = GROUPS.map((group) => ({
  ...group,
  entries: group.items.flatMap((item) => entryOf(item.kind, item.mode) ?? []),
}));

/** Every entry, for the quick-insert menu: one list, searched by what people call things. */
export const ALL_ENTRIES: PaletteEntry[] = PALETTE.flatMap((group) => group.entries);

export function matchesEntry(entry: PaletteEntry, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return `${entry.label} ${entry.also ?? ''} ${entry.kind}`.toLowerCase().includes(needle);
}

interface PaletteProps {
  onAdd: (kind: WidgetKind, mode?: string) => void;
  /** Begin a pointer drag of a new element; the surface decides where it lands. */
  onDragStart: (entry: PaletteEntry, event: React.MouseEvent) => void;
}

/** The page drawn from the graph: how many start and end points still lack their blocks, and the way to make them. */
interface FromGraph {
  points: number;
  onGenerate: () => void;
}

function Tile({ entry, onAdd, onDragStart }: PaletteProps & { entry: PaletteEntry }) {
  const Icon = entry.icon;
  return (
    <button
      type="button"
      className="palette-tile"
      onClick={() => onAdd(entry.kind, entry.mode)}
      // Without preventDefault the browser starts a text selection instead,
      // which looks exactly like a drag that does nothing.
      onMouseDown={(event) => { event.preventDefault(); onDragStart(entry, event); }}
      title={entry.label}
    >
      <span className="palette-chip"><Icon size={14} strokeWidth={2} aria-hidden="true" /></span>
      <span className="truncate">{entry.label}</span>
    </button>
  );
}

export default function DesignerPalette({ onAdd, onDragStart, fromGraph }: PaletteProps & { fromGraph?: FromGraph }) {
  const [more, setMore] = useState(false);

  return (
    <aside
      className="flex flex-col h-full overflow-y-auto gap-1.5 px-3 py-3"
      style={{ width: 168, background: SURFACE, borderRight: `1px solid ${LINE}`, flexShrink: 0 }}
    >
      {PALETTE.map((group) => (
        <section key={group.label} className="flex flex-col gap-1.5">
          <h3 className="px-1 pt-3 text-[11px] font-medium uppercase tracking-wider select-none" style={{ color: DIMMER }}>
            {group.folded ? (
              <button type="button" className="uppercase tracking-wider" aria-expanded={more} onClick={() => setMore((was) => !was)}>
                {`${more ? '▾' : '▸'} ${group.label}`}
              </button>
            ) : group.label}
          </h3>
          {(!group.folded || more) && group.entries.map((entry) => (
            <Tile key={`${entry.kind}:${entry.mode ?? ''}`} entry={entry} onAdd={onAdd} onDragStart={onDragStart} />
          ))}
        </section>
      ))}
      <div className="mt-auto pt-4 flex flex-col gap-2">
        {fromGraph && (
          <Button
            size="sm"
            onClick={fromGraph.onGenerate}
            disabled={!fromGraph.points}
            title={fromGraph.points
              ? 'Add a block for each start point and end point of the graph that has none: what a start point reads, a button, a text for what an end point hands back'
              : 'Every start point and end point of the graph has its blocks'}
          >
            <span className="inline-flex items-center gap-1.5"><Wand2 size={13} strokeWidth={2} aria-hidden="true" /> From the graph</span>
          </Button>
        )}
        <p className="text-[11px] leading-snug" style={{ color: DIMMER }}>
          Drag onto the page, or press <kbd>/</kbd>.
        </p>
      </div>
    </aside>
  );
}
