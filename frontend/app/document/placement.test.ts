import { expect, it } from 'vitest';
import { makeRoom, placement } from './placement';

const card = (kind: string, x: number, y = 0, selected = false) =>
  ({ position: { x, y }, selected, data: { graphNode: { node_type: kind } } });

it('puts a new node right of the selected one, else right of the last that is not an end point, and never on a card', () => {
  expect(placement([])).toEqual({ x: 200, y: 120 });
  // 260 wide when not measured, and a gap of 80 for the wire.
  expect(placement([card('code', 0), card('end', 700)])).toEqual({ x: 340, y: 0 });
  expect(placement([card('code', 0), card('ai', 400, 0, true), card('end', 1200)])).toEqual({ x: 740, y: 0 });
  // The spot is taken by a card of another row: the node goes below it.
  expect(placement([card('code', 0, 0, true), card('ai', 340, 0)])).toEqual({ x: 340, y: 200 });
  // Nothing is added after an end point, selected or not (it is selected the moment it is added).
  expect(placement([card('code', 0), card('end', 340, 0, true)])).toEqual({ x: 340, y: 0 });
  // An end point is no card in the way: it moves right of the new node, so the chain reads left to right.
  const ends = [{ ...card('end', 340), id: 'result' }, { ...card('end', 1200), id: 'far' }, { ...card('end', -400), id: 'left' }];
  expect(placement([card('code', 0), ends[0]])).toEqual({ x: 340, y: 0 });
  expect(makeRoom(ends, { x: 340 })).toEqual([{ id: 'result', x: 680 }]);
});
