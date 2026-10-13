import { describe, expect, it } from 'vitest';
import { parseLook } from './look';

describe('the look of the notebook', () => {
  it('is dark only where it was kept dark: whatever else is stored, or nothing, is the white default', () => {
    expect(parseLook('dark')).toBe('dark');
    for (const other of ['light', 'Dark', '', null, undefined, 3]) expect(parseLook(other)).toBe('light');
  });
});
