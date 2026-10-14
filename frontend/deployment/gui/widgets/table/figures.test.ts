import { describe, expect, it } from 'vitest';
import { columnsOf } from './figures';

describe('a number that rounds to nothing in a delivered table', () => {
  it('has no sign: -0.000012 in a column of two decimals is 0.00, not -0.00', () => {
    const [column] = columnsOf([{ x: -0.000012 }, { x: 1.5 }], ['x']);
    expect(column.show(-0.000012)).toBe('0.00');
    expect(column.show(-1.5)).toBe('-1.50');
  });
});
