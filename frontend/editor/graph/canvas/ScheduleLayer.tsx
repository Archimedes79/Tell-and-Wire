import React from 'react';
import { useStore } from 'reactflow';
import { useGraphNodes, useGraphStore } from '../../document/store/graphStore';
import { sizesOf } from '../../document/model/graphDoc';
import { gridOf, isOpen } from '../../document/model/scheduleLayout';
import { columnsOf } from '../../../../graph/schedule.ts';
import { ACCENT, ACCENT_FILL, ACCENT_TEXT, DIM, DIMMER, LINE, SUNKEN } from '../../../deployment/gui/kit/ui/theme';

/** A small plus at (x, y): the centre of a cell. */
const plus = (x: number, y: number, arm: number): string => `M${x - arm} ${y}H${x + arm}M${x} ${y - arm}V${y + arm}`;

/**
 * What the canvas draws behind the cards for the schedule (`graph/schedule.ts`): a faint plus at the centre of
 * every cell, which a card is pulled to; the ruler -- time runs to the right, a step to a column --, and over a
 * column with two or more cards a note that they may run in parallel or in any order. While a card is held,
 * the pluses it may be pulled to light up, a ringed one is where it would land, and a ⊕ stands in each space
 * between two columns where a column of its own may open for it. While a wire is pulled, the cells it may go through.
 *
 * Under the cards and the wires, in the canvas's own coordinates, and no part of what is clicked.
 */
export default function ScheduleLayer() {
  const [tx, ty, zoom] = useStore((s) => s.transform);
  const table = useGraphStore((s) => s.table);
  const aim = useGraphStore((s) => s.aim);
  const pulling = useGraphStore((s) => s.pulling);
  const wire = useGraphStore((s) => (s.pulling ? s.rfEdges.find((edge) => edge.id === s.pulling!.edge) : undefined));
  const nodes = useGraphNodes();
  if (!table.length) return null;

  const opened = aim?.opens ?? null;
  const grid = gridOf(table, sizesOf(nodes), { column: opened, row: !!aim || !!pulling });
  const shifted = (c: number): number => (opened !== null && c >= opened ? c + 1 : c);

  const faint: string[] = [];
  const dim: string[] = [];
  const lit: string[] = [];
  const columns = columnsOf(table);
  const between = wire && columns.has(wire.source) && columns.has(wire.target)
    ? [Math.min(columns.get(wire.source)!, columns.get(wire.target)!), Math.max(columns.get(wire.source)!, columns.get(wire.target)!)] : null;
  grid.rows.forEach((row, r) => grid.cols.forEach((col, c) => {
    const mark = plus(col.centre, row.centre, 7);
    if (aim) (isOpen(table, aim.reach, aim.id === '_new' ? null : aim.id, opened, c, r) ? lit : dim).push(mark);
    else if (pulling) (between && c > between[0] && c < between[1] && !table[r]?.[c] ? lit : dim).push(mark);
    else faint.push(mark);
  }));

  const ring = aim?.target ? { x: grid.cols[aim.target.column]?.centre, y: grid.rows[aim.target.r]?.centre }
    : pulling?.cell ? { x: grid.cols[pulling.cell.column]?.centre, y: grid.rows[pulling.cell.row]?.centre } : null;
  // The spaces a column may open in, on the row the card is over.
  const spaces: number[] = [];
  if (aim && opened === null) {
    const row = grid.rows[aim.target?.r ?? 0]?.centre ?? grid.rows[0].centre;
    for (let k = 0; k <= grid.cols.length; k++) {
      if (!(aim.reach.lo < k && k <= aim.reach.hi)) continue;
      const x = k === 0 ? grid.cols[0].left - 36 : k === grid.cols.length ? grid.cols[k - 1].right + 36 : (grid.cols[k - 1].right + grid.cols[k].left) / 2;
      spaces.push(x, row);
    }
  }

  // The ruler: a step to each column that holds a card.
  const holding = grid.cols.map(() => 0);
  table.forEach((cells) => cells.forEach((id, c) => { if (id !== null) holding[shifted(c)]++; }));
  let step = 0;
  const left = grid.cols[0].left - 36;
  const right = grid.cols[grid.cols.length - 1].right + 60;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, transform: `translate(${tx}px, ${ty}px) scale(${zoom})`, transformOrigin: '0 0' }}>
        <svg width={1} height={1} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
          <path d={`M${left} 28H${right}M${right - 13} 20L${right} 28L${right - 13} 36`} fill="none" stroke={DIMMER} strokeOpacity={0.55} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          <path d={faint.join('')} fill="none" stroke={DIMMER} strokeOpacity={0.4} strokeWidth={1.5} strokeLinecap="round" />
          <path d={dim.join('')} fill="none" stroke={LINE} strokeWidth={1.5} strokeLinecap="round" />
          <path d={lit.join('')} fill="none" stroke={ACCENT_TEXT} strokeWidth={2.2} strokeLinecap="round" />
          {ring?.x !== undefined && ring.y !== undefined && <circle cx={ring.x} cy={ring.y} r={17} fill="none" stroke={ACCENT} strokeWidth={1.5} />}
          {Array.from({ length: spaces.length / 2 }, (_, i) => (
            <g key={i}>
              <circle cx={spaces[i * 2]} cy={spaces[i * 2 + 1]} r={13} fill={SUNKEN} stroke={ACCENT} strokeWidth={1.5} opacity={0.9} />
              <path d={plus(spaces[i * 2], spaces[i * 2 + 1], 6)} fill="none" stroke={ACCENT_TEXT} strokeWidth={2} strokeLinecap="round" />
            </g>
          ))}
        </svg>
        <div style={{ position: 'absolute', left: left, top: 2, fontSize: 13, lineHeight: '18px', letterSpacing: '0.08em', textTransform: 'uppercase', color: DIM }}>time</div>
        {grid.cols.map((col, c) => {
          if (!holding[c] && !(opened === c)) return null;
          const fresh = opened === c;
          if (!fresh) step++;
          return (
            <React.Fragment key={c}>
              <div style={{ position: 'absolute', left: col.centre - 70, top: 40, width: 140, textAlign: 'center', fontSize: 15, lineHeight: '20px', color: fresh ? ACCENT_TEXT : DIM }}>
                {fresh ? 'new step' : `step ${step}`}
              </div>
              {holding[c] >= 2 && (
                <div
                  style={{
                    position: 'absolute', left: col.centre - 62, top: 68, width: 124, height: 26, boxSizing: 'border-box', borderRadius: 13,
                    border: `1px solid color-mix(in srgb, ${ACCENT_TEXT} 45%, transparent)`, background: ACCENT_FILL, color: ACCENT_TEXT,
                    fontSize: 13, lineHeight: '24px', textAlign: 'center',
                  }}
                >
                  ‖ any order
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
