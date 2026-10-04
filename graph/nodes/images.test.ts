import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { imageDataUrl } from './images.ts';
import { nodeFiles } from '../core/node.ts';
import { parseWidget, widgetElement } from '../../backend/gui-editor/widgets/page.ts';
import type { FileService, Runtime } from './Runtime.ts';

/**
 * Pictures, on the way to a browser or to a model.
 *
 * Both refuse the same two things by name: a file that is not an image, and
 * one too large to inline. Refusing late means a broken picture in one case
 * and a bill in the other.
 */

// A one-pixel PNG, so a real file with a real header exists to read.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const runtime = { files: nodeFiles } as Runtime;

describe('a picture', () => {
  it('is inlined, refused by name when it is no image, and refused unread when it is huge; the block shows the reason instead of raising it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tell-and-wire-images-'));
    try {
      const png = join(dir, 'dot.png');
      await writeFile(png, PNG);
      expect((await imageDataUrl(png, runtime.files)).startsWith('data:image/png;base64,')).toBe(true);

      const notes = join(dir, 'notes.txt');
      await writeFile(notes, 'not a picture');
      await expect(imageDataUrl(notes, runtime.files)).rejects.toThrow(/Not a recognised image/);

      // Reading all of a picture of gigabytes is the harm, so it is refused by its size alone.
      let reads = 0;
      const files: FileService = {
        ...nodeFiles,
        size: async () => 3 * 1024 * 1024 * 1024,
        read: async () => { reads += 1; return 'AAAA'; },
      };
      await expect(imageDataUrl('/photos/huge.png', files)).rejects.toThrow('huge.png is 3072.0 MB; the limit is 8 MB.');
      expect(reads).toBe(0);

      // Nothing downstream depends on a picture: failing would take every sibling block down with it.
      const block = widgetElement('image_view')!;
      const widget = parseWidget({ id: 'w', kind: 'image_view', label: 'Picture' });
      expect(String(await block.displayValue(widget, 'missing.png', runtime)).startsWith('⚠')).toBe(true);
      expect(await block.displayValue(widget, 'https://example.com/a.png', runtime)).toBe('https://example.com/a.png');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
