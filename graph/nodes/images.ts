// Turning a picture on disk into something that can be looked at or sent, and
// the one place where the size of a file read is limited.
//
// The image block shows a picture with `imageDataUrl`, and `fileContent.ts`
// hands a node that reads a file a picture or a PDF, which an AI node sends as
// it is. Both need it for the same reason: the filesystem a run reads is not
// the browser's, and it is not the model provider's either -- a path means
// nothing to either of them.

import type { FileService } from './Runtime.ts';

/** Bigger than this and reading a file is a mistake rather than a slow request. */
const MAX_BYTES = 8 * 1024 * 1024;

const MEDIA_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
};

/** The media type a path claims by its suffix, or null if it claims none. */
export function imageMediaType(path: string): string | null {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? null : MEDIA_TYPES[path.slice(dot).toLowerCase()] ?? null;
}

/** Already something a browser or a provider can take. */
export function isInlineUrl(value: string): boolean {
  return value.startsWith('data:') || value.startsWith('http://') || value.startsWith('https://');
}

/**
 * The file at *path*, or refused by name when it is too large: it would
 * otherwise travel -- to a browser as a broken picture, to a provider as a
 * bill -- and the message a person can act on is the one that says which file
 * and how big. The size is asked before anything is read: reading a file of
 * gigabytes whole, only to refuse it, is the harm itself.
 */
export async function readWithinLimit(path: string, files: FileService, mode: 'text' | 'binary'): Promise<string> {
  const bytes = await files.size(path);
  if (bytes > MAX_BYTES) {
    throw new Error(`${path} is ${(bytes / 1024 / 1024).toFixed(1)} MB; the limit is ${MAX_BYTES / 1024 / 1024} MB.`);
  }
  return files.read(path, mode);
}

/** Read an image file and return it as a `data:` URL; a file that is not an image is refused by name. */
export async function imageDataUrl(path: string, files: FileService): Promise<string> {
  const resolved = files.resolve(path);
  const mediaType = imageMediaType(resolved);
  if (!mediaType) throw new Error(`Not a recognised image file: ${resolved}`);
  return `data:${mediaType};base64,${await readWithinLimit(resolved, files, 'binary')}`;
}
