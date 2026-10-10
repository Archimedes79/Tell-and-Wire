// The text layer of a PDF, a page at a time.
//
// unpdf (pdf.js) reads it. A PDF that is a picture of text -- a scan -- has no
// text layer, and nothing here reads pictures: the pages come back empty, and
// the caller says so rather than hand on an empty string.

import { extractText, getDocumentProxy, getMeta } from 'unpdf';
import { UserError } from './errors.ts';

export interface PdfText {
  title: string;
  /** The text of each page, in page order; an empty string for a page without text. */
  pages: string[];
}

function describe(error: unknown): string {
  const name = (error as { name?: string } | undefined)?.name;
  if (name === 'PasswordException') return 'the PDF is password-protected';
  if (name === 'InvalidPDFException' || name === 'FormatError' || name === 'MissingPDFException') return 'not a readable PDF file';
  return `the PDF could not be read (${error instanceof Error ? error.message : String(error)})`;
}

const tidy = (text: string): string =>
  text.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

export async function readPdf(bytes: Uint8Array, maxPages: number): Promise<PdfText> {
  let document;
  try {
    // verbosity 0: pdf.js reports what it repaired with console.log, which must not reach a protocol on stdout.
    document = await getDocumentProxy(new Uint8Array(bytes), { verbosity: 0 });
  } catch (error) {
    throw new UserError(describe(error));
  }
  try {
    if (document.numPages > maxPages) {
      throw new UserError(`the PDF has ${document.numPages} pages; this server reads up to ${maxPages} (TW_DOCS_MAX_PAGES)`);
    }
    const { text } = await extractText(document, { mergePages: false });
    const info = ((await getMeta(document)).info ?? {}) as { Title?: unknown };
    return { title: typeof info.Title === 'string' ? info.Title.trim() : '', pages: text.map(tidy) };
  } catch (error) {
    throw error instanceof UserError ? error : new UserError(describe(error));
  } finally {
    await document.loadingTask.destroy();
  }
}
