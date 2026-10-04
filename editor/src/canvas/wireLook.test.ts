import { describe, expect, it } from 'vitest';
import type { Edge } from 'reactflow';
import { RUN_PORT } from '@engine/execution/triggers.ts';
import { ACCENT, DIMMER, EVENT } from '@/ui/theme';
import { drawnWire } from './wireLook';

const wire = (source: string, target: string, targetHandle = 'text', selected = false): Edge => ({
  id: `${source}-${target}`, source, sourceHandle: 'output', target, targetHandle, selected,
});

describe('a wire on the canvas', () => {
  it('is a soft grey line, so the cards are what the eye finds first', () => {
    expect(drawnWire(wire('read', 'count'), new Set()).style).toEqual({ stroke: DIMMER, strokeWidth: 2 });
  });

  it('takes the accent, drawn over the others, where it touches a selected node -- or is itself selected', () => {
    for (const drawn of [drawnWire(wire('read', 'count'), new Set(['count'])), drawnWire(wire('read', 'count'), new Set(['read'])),
      drawnWire(wire('read', 'count', 'text', true), new Set())]) {
      expect(drawn.style).toMatchObject({ stroke: ACCENT });
      expect(drawn.zIndex).toBeGreaterThan(drawnWire(wire('read', 'count'), new Set()).zIndex!);
    }
    expect(drawnWire(wire('read', 'count'), new Set(['other'])).style).toMatchObject({ stroke: DIMMER });
  });

  it('lies under every card, lit or not, so a click on a node it passes over is the node\'s', () => {
    // Rebuilt by hand: a lit wire crossing a node took the click meant for the
    // node (the element hit was `react-flow__edge-interaction`), and the wrong
    // node stayed selected. A card is drawn at 0, after the wires.
    for (const drawn of [drawnWire(wire('read', 'count'), new Set()), drawnWire(wire('read', 'count'), new Set(['count'])),
      drawnWire(wire('read', 'count', 'text', true), new Set())]) {
      expect(drawn.zIndex).toBeLessThanOrEqual(0);
    }
  });

  it('into a ◆ stays dashed and amber whatever is selected: it starts a run and carries nothing', () => {
    for (const selected of [new Set<string>(), new Set(['count'])]) {
      expect(drawnWire(wire('page', 'count', RUN_PORT), selected).style).toMatchObject({ stroke: EVENT, strokeDasharray: '6 4' });
    }
  });
});
