import { describe, expect, it } from 'vitest';
import { saveNote } from './status';

describe('whether the page is kept', () => {
  it('says nothing about a new page nobody touched, and says so of one that was changed and never saved', () => {
    expect(saveNote({ path: '', dirty: false, savedAt: 0 }).words).toBe('');
    expect(saveNote({ path: '', dirty: true, savedAt: 0 })).toEqual({ kind: 'new', words: 'Not saved yet' });
  });
  it('says a saved page was changed after it was saved, and when it was', () => {
    const at = new Date(2026, 9, 12, 14, 32).getTime();
    expect(saveNote({ path: '/p', dirty: true, savedAt: at })).toMatchObject({ kind: 'changed' });
    expect(saveNote({ path: '/p', dirty: true, savedAt: at }).words).toMatch(/^Changed since you saved it at \d/);
    expect(saveNote({ path: '/p', dirty: false, savedAt: at })).toMatchObject({ kind: 'saved' });
  });
});
