import { describe, expect, it } from 'vitest';
import { carriesFiles, droppedFile, droppedPath, uriPath } from '../../../gui/widgets/input_picker/dropped.ts';

const transfer = (files: { name: string; size: number }[], uri = '') => ({ files, types: files.length ? ['Files'] : [], getData: () => uri });

describe('a file dropped onto a picker', () => {
  it('is told from a drag that carries none', () => {
    expect(carriesFiles({ types: ['Files'] })).toBe(true);
    expect(carriesFiles({ types: ['text/plain'] })).toBe(false);
    expect(carriesFiles(null)).toBe(false);
  });

  it('says its name and size, and where it is when the drop said', () => {
    expect(droppedFile(transfer([{ name: 'a.csv', size: 5 }]))).toEqual({ name: 'a.csv', size: 5 });
    expect(droppedFile(transfer([{ name: 'a.csv', size: 5 }], 'file:///D:/data/a.csv'))).toEqual({ name: 'a.csv', size: 5, uri: 'file:///D:/data/a.csv' });
    expect(droppedFile(transfer([]))).toBeUndefined();
  });

  it('reads a file: URI as a path', () => {
    expect(uriPath('file:///D:/data/a%20b.csv')).toBe('D:/data/a b.csv');
    expect(uriPath('file:///home/a.csv')).toBe('/home/a.csv');
    expect(uriPath('file://server/share/a.csv')).toBe('//server/share/a.csv');
  });

  it('is found by its URI, else by the one file of its name and size the host finds', async () => {
    const never = async () => { throw new Error('asked'); };
    expect(await droppedPath({ name: 'a.csv', size: 5, uri: 'file:///home/a.csv' }, never)).toBe('/home/a.csv');
    expect(await droppedPath({ name: 'a.csv', size: 5 }, async () => ({ paths: ['/t/data/a.csv'], searched: '/t' }))).toBe('/t/data/a.csv');
  });

  it('says what went wrong where it finds none or several, and what to do instead', async () => {
    await expect(droppedPath({ name: 'a.csv', size: 5 }, async () => ({ paths: [], searched: '/t and 3 levels' }))).rejects.toThrow(/no “a.csv” of that size is in \/t and 3 levels.*Browse…/);
    await expect(droppedPath({ name: 'a.csv', size: 5 }, async () => ({ paths: ['/1', '/2'], searched: '/t' }))).rejects.toThrow(/2 files called “a.csv”.*Browse…/);
  });
});
