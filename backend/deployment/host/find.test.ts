import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findFiles, searchedIn } from './find.ts';

describe('finding a dropped file', () => {
  it('finds files of the name and size below the folder, and leaves out what a search leaves out', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tw-find-'));
    try {
      mkdirSync(join(root, 'data', 'deep'), { recursive: true });
      mkdirSync(join(root, 'node_modules'), { recursive: true });
      mkdirSync(join(root, '.hidden'), { recursive: true });
      writeFileSync(join(root, 'a.csv'), '12345');
      writeFileSync(join(root, 'data', 'a.csv'), '12345');
      writeFileSync(join(root, 'data', 'deep', 'a.csv'), '123');
      writeFileSync(join(root, 'node_modules', 'a.csv'), '12345');
      writeFileSync(join(root, '.hidden', 'a.csv'), '12345');
      expect((await findFiles(root, 'a.csv', 5)).sort()).toEqual([join(root, 'a.csv'), join(root, 'data', 'a.csv')]);
      expect(await findFiles(root, 'a.csv', 3)).toEqual([join(root, 'data', 'deep', 'a.csv')]);
      expect(await findFiles(root, 'b.csv', 5)).toEqual([]);
      expect(searchedIn(root)).toContain(root);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
