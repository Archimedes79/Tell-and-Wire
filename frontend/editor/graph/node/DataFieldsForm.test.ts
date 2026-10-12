import { describe, expect, it } from 'vitest';
import { fieldName, startValue } from './DataFieldsForm';

describe('a data node\'s fields by hand', () => {
  it('turns what was typed into a name a body can read and a wire can point at', () => {
    expect(fieldName('total')).toBe('total');
    expect(fieldName('  Running total ')).toBe('Running_total');
    expect(fieldName('how many?!')).toBe('how_many');
    expect(fieldName('Größe')).toBe('Größe');
    expect(fieldName('  ')).toBe('');
  });

  it('reads what a field starts as: a number, true, a list, a record -- else the words as typed', () => {
    expect(startValue('0')).toBe(0);
    expect(startValue('2.5')).toBe(2.5);
    expect(startValue('true')).toBe(true);
    expect(startValue('[]')).toEqual([]);
    expect(startValue('{"a": 1}')).toEqual({ a: 1 });
    expect(startValue('"quoted"')).toBe('quoted');
    expect(startValue('hello there')).toBe('hello there');
    expect(startValue('')).toBe('');
  });
});
