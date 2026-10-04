import type { Edge } from 'reactflow';
import { RUN_PORT } from '@engine/execution/triggers.ts';
import { ACCENT, DIMMER, EVENT } from '@/ui/theme';

/**
 * How a wire is drawn: a soft grey line, so the cards are what the eye finds
 * first -- and in the accent where it touches a node that is selected, or is
 * itself selected and about to be deleted, so what a node is wired to shows
 * the moment it is chosen.
 *
 * A wire into a ◆ only opens a gate -- whether the node runs this round -- and
 * delivers nothing, so it stays dashed and amber whatever is selected: drawn
 * like data, it would ask what the node does with the `true` it carries.
 */
export function drawnWire(edge: Edge, selected: ReadonlySet<string>): Edge {
  const lit = !!edge.selected || selected.has(edge.source) || selected.has(edge.target);
  const signal = edge.targetHandle === RUN_PORT;
  return {
    ...edge,
    // Over the grey ones where they cross, and under every card: a card is
    // drawn at 0 after the wires, so a wire at 0 or below never takes a click
    // meant for the node it passes over. A lit wire at 1 lay over the cards,
    // and a click on a node under it selected the wire instead.
    zIndex: lit ? 0 : -1,
    style: {
      stroke: signal ? EVENT : lit ? ACCENT : DIMMER,
      strokeWidth: lit ? 2.5 : 2,
      ...(signal ? { strokeDasharray: '6 4' } : {}),
    },
  };
}
