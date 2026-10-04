import { describe, it, expect } from 'vitest';
import { csvText } from './download';

describe('a table saved as CSV', () => {
  it('is its header and its rows, a line each ending in CRLF, a cell with a comma, a quote or a line break quoted, one that would run as a formula made text', () => {
    expect(csvText(['city', 'people'], [['Oslo', '700000'], ['Bergen', '290000']]))
      .toBe('city,people\r\nOslo,700000\r\nBergen,290000\r\n');
    expect(csvText(['note'], [['a, b'], ['say "hi"'], ['two\nlines'], ['plain']]))
      .toBe('note\r\n"a, b"\r\n"say ""hi"""\r\n"two\nlines"\r\nplain\r\n');
    // A number stays a number; a formula, however it starts, becomes text.
    expect(csvText(['v'], [['-5'], ['=1+1'], ['@SUM(A1)'], ['+cmd'], ['-2+3'], ['3.5e-2']]))
      .toBe("v\r\n-5\r\n'=1+1\r\n'@SUM(A1)\r\n'+cmd\r\n'-2+3\r\n3.5e-2\r\n");
  });
});
