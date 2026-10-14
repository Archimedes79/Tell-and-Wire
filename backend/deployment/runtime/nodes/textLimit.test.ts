import { describe, expect, it } from 'vitest';
import { readWithinLimit } from '../../../../graph/nodes/images.ts';
import type { FileService } from '../../../../graph/nodes/Runtime.ts';

/** Text has no size limit; a picture or a PDF has one, because it travels as base64 (`graph/nodes/images.ts`). */
describe('the size of a file read', () => {
  const files = (size: number, read: () => Promise<string>): FileService => ({ size: async () => size, read, resolve: (path: string) => path } as unknown as FileService);

  it('is not limited for text: a table of 100 MB is read whole', async () => {
    expect(await readWithinLimit('/data/big.csv', files(100 * 1024 * 1024, async () => 'a,b\n1,2\n'), 'text')).toBe('a,b\n1,2\n');
  });

  it('is limited for a picture, by its size alone', async () => {
    let reads = 0;
    await expect(readWithinLimit('/p/huge.png', files(9 * 1024 * 1024, async () => { reads += 1; return ''; }), 'binary')).rejects.toThrow('huge.png is 9.0 MB; the limit is 8 MB.');
    expect(reads).toBe(0);
  });

  it('says a text longer than a string can be is too large for what it is, by name', async () => {
    const tooLong = async (): Promise<string> => { throw Object.assign(new Error('Cannot create a string longer than 0x1fffffe8 characters'), { code: 'ERR_STRING_TOO_LONG' }); };
    await expect(readWithinLimit('/data/huge.csv', files(1, tooLong), 'text')).rejects.toThrow(/huge\.csv is too large to read as one text/);
  });
});
