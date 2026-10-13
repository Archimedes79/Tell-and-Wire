import { describe, expect, it } from 'vitest';
import { columnsOf, isTotal } from './figures';

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

  it('colour a signed percentage: a rise and a fall, and nothing else', () => {
    expect([growth.tone('+10.2 %'), growth.tone('-1.8 %'), growth.tone('−3 %'), growth.tone('4 %'), growth.tone('–'), growth.tone(5)]).toEqual(['up', 'down', 'down', undefined, undefined, undefined]);
  });

  it('set a row that says Total apart, in either language', () => {
    expect(ROWS.map((row) => isTotal(row, NAMES))).toEqual([false, false, true]);
    expect(isTotal({ Region: 'Summe' }, ['Region'])).toBe(true);
    expect(isTotal({ Region: 'Totally' }, ['Region'])).toBe(false);
  });
});
