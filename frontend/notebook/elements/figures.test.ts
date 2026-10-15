import { describe, expect, it } from 'vitest';
import { columnsOf, isTotal, rowOrder } from './figures';

const NAMES = ['Region', 'Revenue', 'Average order', 'Growth', 'Year'];
const ROWS = [
  { Region: 'North', Revenue: 174898, 'Average order': 71.6, Growth: '+10.2 %', Year: 2026 },
  { Region: 'South', Revenue: 1234, 'Average order': 71, Growth: '-1.8 %', Year: 2026 },
  { Region: 'Total', Revenue: 1000000, 'Average order': 71.5, Growth: '–', Year: 2026 },
];
const [region, revenue, average, growth, year] = columnsOf(ROWS, NAMES, 'en-US');

describe('the cells of a key-figure table', () => {
  it('stand to the right where they are figures: numbers, and text that is one with its sign, percent or unit', () => {
    expect([region, revenue, average, growth, year].map((one) => one.numeric)).toEqual([false, true, true, true, true]);
    const units = columnsOf([{ weight: '71 kg' }, { weight: '3,5 kg' }, { weight: '' }], ['weight'], 'en-US')[0];
    expect(units.numeric).toBe(true);
    expect(columnsOf([{ note: 'fine' }, { note: '12' }], ['note'])[0].numeric).toBe(false);
    expect(columnsOf([{ empty: null }], ['empty'])[0].numeric).toBe(false);
  });

  it('tell thousands apart, keep the same decimals all down a column, and leave a year alone', () => {
    expect(ROWS.map((row) => revenue.show(row.Revenue))).toEqual(['174,898', '1,234', '1,000,000']);
    expect(ROWS.map((row) => average.show(row['Average order']))).toEqual(['71.60', '71.00', '71.50']);
    expect(year.show(2026)).toBe('2026');
    expect(growth.show('+10.2 %')).toBe('+10.2 %');
  });

  it('keep each number as it is in a column that is not all figures: a measure and its value', () => {
    const rows = [{ Measure: 'Words', Value: 32 }, { Measure: 'Per sentence', Value: 10.7 }, { Measure: 'Longest', Value: 'lighthouse' }];
    const value = columnsOf(rows, ['Measure', 'Value'])[1];
    expect(value.numeric).toBe(false);
    expect(rows.map((row) => value.show(row.Value))).toEqual(['32', '10.7', 'lighthouse']);
  });

  it('colour a signed percentage: a rise and a fall, and nothing else', () => {
    expect([growth.tone('+10.2 %'), growth.tone('-1.8 %'), growth.tone('−3 %'), growth.tone('4 %'), growth.tone('–'), growth.tone(5)]).toEqual(['up', 'down', 'down', undefined, undefined, undefined]);
  });

  it('set a row that says Total apart, in either language', () => {
    expect(ROWS.map((row) => isTotal(row, NAMES))).toEqual([false, false, true]);
    expect(isTotal({ Region: 'Summe' }, ['Region'])).toBe(true);
    expect(isTotal({ Region: 'Totally' }, ['Region'])).toBe(false);
  });
});

describe('a number that rounds to nothing', () => {
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
