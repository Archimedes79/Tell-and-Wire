import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openExternal, NotOpenable } from './files.ts';

describe('openExternal', () => {
  // Only the refusals are tested: the acceptance starts a program on whatever
  // machine runs the suite, and a test that opens an editor window is one
  // nobody keeps switched on.
  it('refuses a path outside the graph\'s own node folder, and anything that is not text a node keeps: nothing a system would run', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'editor-files-'));
    await mkdir(join(dir, 'sub'));
    await writeFile(join(dir, 'b.txt'), 'hello');
    await writeFile(join(dir, 'blob.bin'), Buffer.from([0xff, 0xfe, 0x00, 0x80]));
    await writeFile(join(dir, 'run.bat'), 'echo hi');
    await expect(openExternal(join(dir, 'sub'), '../b.txt')).rejects.toBeInstanceOf(NotOpenable);
    await expect(openExternal(dir, 'blob.bin')).rejects.toBeInstanceOf(NotOpenable);
    await expect(openExternal(dir, 'run.bat')).rejects.toBeInstanceOf(NotOpenable);
  });
});
