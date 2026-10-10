// Reading a file: find it (inside the folders it was given), take its text out,
// hand it over in pieces.

import { readFile, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { docxMarkdown } from './docx.ts';
import { UserError } from './errors.ts';
import { piece } from './paging.ts';
import { readPdf } from './pdf.ts';
import { AccessError, listInside, resolveInside, shown, type Entry } from './roots.ts';

export interface Limits {
  maxBytes: number;
  maxPages: number;
}

export interface DocumentResult {
  path: string;
  kind: 'pdf' | 'docx';
  title: string;
  /** Null for a Word file: its pages are what Word makes of it. */
  pages: number | null;
  word_count: number;
  total_chars: number;
  start: number;
  end: number;
  /** Where to start the next call to read on; null: this was the end. */
  next_start: number | null;
  content: string;
  warning: string;
}

interface Loaded {
  kind: 'pdf' | 'docx';
  title: string;
  pages: number | null;
  /** Words of the text itself: the page marks are not words. */
  words: number;
  markdown: string;
  warning: string;
}

const wordsIn = (text: string): number => text.split(/\s+/).filter(Boolean).length;

const KINDS: Record<string, 'pdf' | 'docx'> = { '.pdf': 'pdf', '.docx': 'docx' };
const KEEP_MS = 5 * 60 * 1000;
const KEEP_FILES = 8;

export const readable = (name: string): boolean => extname(name).toLowerCase() in KINDS;

export class DocumentReader {
  private roots: string[];
  private limits: Limits;
  private now: () => number;
  private files = new Map<string, { at: number; loaded: Loaded }>();

  /** *roots* are real folders (`openRoots`). */
  constructor(roots: string[], limits: Limits, now: () => number = Date.now) {
    this.roots = roots;
    this.limits = limits;
    this.now = now;
  }

  async read(path: string, maxChars: number, start: number): Promise<DocumentResult> {
    const real = await resolveInside(this.roots, path, 'file');
    const kind = KINDS[extname(real).toLowerCase()];
    if (!kind) throw new AccessError(`only .pdf and .docx files are read, not ${extname(real) || 'a file without an extension'}`);
    const info = await stat(real);
    if (info.size > this.limits.maxBytes) {
      throw new UserError(`the file is larger than ${Math.round(this.limits.maxBytes / 1024 / 1024 * 10) / 10} MB (TW_DOCS_MAX_BYTES)`);
    }
    // The same file, changed, is another file.
    const key = `${real}|${info.mtimeMs}|${info.size}`;
    const kept = this.files.get(key);
    let loaded = kept && this.now() - kept.at < KEEP_MS ? kept.loaded : undefined;
    if (!loaded) {
      loaded = await this.load(real, kind);
      this.files.delete(key);
      this.files.set(key, { at: this.now(), loaded });
      while (this.files.size > KEEP_FILES) this.files.delete(this.files.keys().next().value as string);
    }
    const part = piece(loaded.markdown, start, maxChars);
    return {
      path: shown(this.roots, real),
      kind: loaded.kind,
      title: loaded.title,
      pages: loaded.pages,
      word_count: loaded.words,
      total_chars: loaded.markdown.length,
      start: part.start,
      end: part.end,
      next_start: part.next,
      content: part.text,
      warning: loaded.warning,
    };
  }

  async list(folder: string | undefined): Promise<{ folder: string; entries: Entry[]; truncated: boolean }> {
    return listInside(this.roots, folder, readable);
  }

  private async load(real: string, kind: 'pdf' | 'docx'): Promise<Loaded> {
    const bytes = await readFile(real);
    const name = basename(real, extname(real));
    if (kind === 'docx') {
      const markdown = (await docxMarkdown(bytes)).trim();
      if (!markdown) throw new UserError('the document has no text');
      return { kind, title: /^# (.+)$/m.exec(markdown)?.[1] ?? name, pages: null, words: wordsIn(markdown), markdown, warning: '' };
    }
    const pdf = await readPdf(bytes, this.limits.maxPages);
    const withText = pdf.pages.filter(Boolean).length;
    if (!withText) throw new UserError('the PDF has no text layer (a scan?); this server does not read pictures of text');
    return {
      kind,
      title: pdf.title || name,
      pages: pdf.pages.length,
      words: wordsIn(pdf.pages.join(' ')),
      markdown: pdf.pages.map((text, index) => (text ? `[Page ${index + 1}]\n${text}` : '')).filter(Boolean).join('\n\n'),
      warning: withText < pdf.pages.length ? `${pdf.pages.length - withText} of ${pdf.pages.length} pages have no text (scans?).` : '',
    };
  }
}
