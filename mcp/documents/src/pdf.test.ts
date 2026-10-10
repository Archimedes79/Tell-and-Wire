import { describe, expect, it, vi } from 'vitest';
import { readPdf } from './pdf.ts';
import { pdfOf } from './testFiles.ts';

describe('readPdf', () => {
  it('gives the text of each page, with its line breaks and its accents', async () => {
    const pdf = await readPdf(pdfOf([['The Lighthouse Keeper', 'For thirty-one years Ansel Brandt kept the light.', 'Caf\xe9 au lait (hot) costs 3.50.'], ['Second page.']]), 500);
    expect(pdf.pages).toEqual([
      'The Lighthouse Keeper\nFor thirty-one years Ansel Brandt kept the light.\nCaf\xe9 au lait (hot) costs 3.50.',
      'Second page.',
    ]);
  });

  it('gives an empty string for a page without text, and keeps the count', async () => {
    const pdf = await readPdf(pdfOf([['Text here.'], [], ['More text.']]), 500);
    expect(pdf.pages).toEqual(['Text here.', '', 'More text.']);
  });

  it('says what is wrong with a file that is no PDF, and with one that has too many pages', async () => {
    await expect(readPdf(Uint8Array.from(Buffer.from('this is not a pdf')), 500)).rejects.toThrow('not a readable PDF file');
    await expect(readPdf(pdfOf([['a'], ['b'], ['c']]), 2)).rejects.toThrow(/has 3 pages; this server reads up to 2 \(TW_DOCS_MAX_PAGES\)/);
  });

  it('writes nothing to the console while it repairs a damaged index: stdout belongs to the protocol', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const pdf = await readPdf(pdfOf([['Still readable.']], true), 500);
      expect(pdf.pages).toEqual(['Still readable.']);
      expect(log).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      warn.mockRestore();
    }
  });
});
