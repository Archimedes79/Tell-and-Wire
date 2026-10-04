import { describe, it, expect } from 'vitest';
import { csvText } from './download';

describe('a table saved as CSV', () => {
  it('is its header and its rows, a line each ending in CRLF, a cell with a comma, a quote or a line break quoted', () => {
    expect(csvText(['city', 'people'], [['Oslo', '700000'], ['Bergen', '290000']]))
      .toBe('city,people\r\nOslo,700000\r\nBergen,290000\r\n');
    expect(csvText(['note'], [['a, b'], ['say "hi"'], ['two\nlines'], ['plain']]))
      .toBe('note\r\n"a, b"\r\n"say ""hi"""\r\n"two\nlines"\r\nplain\r\n');
  });
});
