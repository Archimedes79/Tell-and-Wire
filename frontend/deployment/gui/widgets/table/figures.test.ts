import { describe, expect, it } from 'vitest';
import { columnsOf, rowOrder } from './figures';

describe('a number that rounds to nothing in a delivered table', () => {
  it('has no sign: -0.000012 in a column of two decimals is 0.00, not -0.00', () => {
    const [column] = columnsOf([{ x: -0.000012 }, { x: 1.5 }], ['x']);
    expect(column.show(-0.000012)).toBe('0.00');
    expect(column.show(-1.5)).toBe('-1.50');
  });
});

describe('the order of a sorted column', () => {
  it('goes by size for figures, as a person reads words, with empty cells last and a Total where it was', () => {
    // 10 and 9 as numbers, not as words; "+10.2 %" as a figure.
    expect(rowOrder([10, 9, 100, 1], false)).toEqual([3, 1, 0, 2]);
    expect(rowOrder([10, 9, 100, 1], true)).toEqual([2, 0, 1, 3]);
    expect(rowOrder(['+10.2 %', '-1.8 %', '+6.4 %'], false)).toEqual([1, 2, 0]);
    expect(rowOrder(['a10', 'a2', 'B1'], false)).toEqual([1, 0, 2]);
    // Empty cells are last whichever way it goes; a row apart stays at the end.
    expect(rowOrder([3, null, 1, '', 2], false)).toEqual([2, 4, 0, 1, 3]);
    expect(rowOrder([3, null, 1, '', 2], true)).toEqual([0, 4, 2, 1, 3]);
    expect(rowOrder([5, 1, 100, 6], false, [false, false, true, false])).toEqual([1, 0, 3, 2]);
  });
});
