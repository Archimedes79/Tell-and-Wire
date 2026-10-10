// What a node that reads a file is handed.
//
// "Read the file at this path" hands a node what is in the file. For text that
// is the text. A picture or a PDF has no text to hand, so it is handed as
// itself -- a `data:` URL -- which an AI node sends to the model as the file it
// is (`ask.ts`). A Word file is not converted here: it is handed on as the path
// it is, and the documents tool server (`mcp/documents`) reads it as Markdown.

import type { FileService } from './Runtime.ts';
import { imageMediaType, readWithinLimit } from './images.ts';

/** The media type of a file handed as itself, or null for one handed as text. */
export function inlineMediaType(path: string): string | null {
  return /\.pdf$/i.test(path) ? 'application/pdf' : imageMediaType(path);
}

/** Whether *value* is a `data:` URL of a file handed as itself -- a picture, a PDF -- that a model can be sent. */
export function isInlineFile(value: unknown): boolean {
  return typeof value === 'string' && /^data:(image\/[\w.+-]+|application\/pdf);base64,/.test(value);
}

/** What is in the file at *path*, as a node reading it is handed it. A file over 8 MB is refused unread. */
export async function fileContent(path: string, files: FileService): Promise<string> {
  if (/\.docx$/i.test(path)) return path;
  const mediaType = inlineMediaType(path);
  return mediaType ? `data:${mediaType};base64,${await readWithinLimit(path, files, 'binary')}` : readWithinLimit(path, files, 'text');
}
