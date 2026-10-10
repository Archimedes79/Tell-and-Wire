import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DocumentReader } from './documents.ts';
import { openRoots } from './roots.ts';
import { docxOf, p, pdfOf, r } from './testFiles.ts';

let base = '';
let roots: string[] = [];
const limits = { maxBytes: 5 * 1024 * 1024, maxPages: 100 };
const reader = (over: Partial<typeof limits> = {}, now?: () => number) => new DocumentReader(roots, { ...limits, ...over }, now);

beforeAll(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'tw-docs-reader-')));
  await mkdir(join(base, 'root', 'sub'), { recursive: true });
  const root = join(base, 'root');
  roots = await openRoots([root]);
  await writeFile(join(root, 'story.docx'), docxOf(p(r('The Lighthouse Keeper'), '<w:pStyle w:val="Titel"/>') + p(r('For thirty-one years Ansel Brandt kept the light.'))));
  await writeFile(join(root, 'report.pdf'), pdfOf([['Annual report', 'Revenue grew.'], ['Outlook', 'Revenue will grow again.']]));
  await writeFile(join(root, 'scan.pdf'), pdfOf([[], []]));
  await writeFile(join(root, 'half.pdf'), pdfOf([['Text.'], []]));
  await writeFile(join(root, 'broken.pdf'), 'not a pdf');
  await writeFile(join(root, 'broken.docx'), 'not a docx');
  await writeFile(join(root, 'old.doc'), 'x');
  await writeFile(join(root, 'noext'), 'x');
  await writeFile(join(root, 'sub', 'deep.docx'), docxOf(p(r('Deep down.'))));
  await writeFile(join(base, 'outside.docx'), docxOf(p(r('Not for you.'))));
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('DocumentReader.read', () => {
  it('reads a Word file as Markdown, titled by its heading', async () => {
    const result = await reader().read('story.docx', 8000, 0);
    expect(result).toMatchObject({ path: 'story.docx', kind: 'docx', title: 'The Lighthouse Keeper', pages: null, next_start: null, warning: '' });
    expect(result.content).toBe('# The Lighthouse Keeper\n\nFor thirty-one years Ansel Brandt kept the light.');
  });

  it('reads a PDF page by page, marked, titled by its file name', async () => {
    const result = await reader().read('report.pdf', 8000, 0);
    expect(result).toMatchObject({ path: 'report.pdf', kind: 'pdf', title: 'report', pages: 2, warning: '' });
    expect(result.content).toBe('[Page 1]\nAnnual report\nRevenue grew.\n\n[Page 2]\nOutlook\nRevenue will grow again.');
    expect(result.word_count).toBe(9);
  });

  it('reads a file in a sub-folder, by a relative path or an absolute one', async () => {
    expect((await reader().read('sub/deep.docx', 8000, 0)).path).toBe('sub/deep.docx');
    expect((await reader().read(join(roots[0], 'sub', 'deep.docx'), 8000, 0)).content).toBe('Deep down.');
  });

  it('reads a long file in pieces that join up', async () => {
    const lines = Array.from({ length: 80 }, (_, n) => p(r(`Paragraph ${n} of a long document, with enough words in it to take up room.`))).join('');
    await writeFile(join(roots[0], 'long.docx'), docxOf(lines));
    const seen: string[] = [];
    let at: number | null = 0;
    while (at !== null) {
      const part = await reader().read('long.docx', 1000, at);
      expect(part.content.length).toBeLessThanOrEqual(1000);
      seen.push(part.content);
      at = part.next_start;
    }
    expect(seen.length).toBeGreaterThan(4);
    for (let n = 0; n < 80; n += 1) expect(seen.join(' ')).toContain(`Paragraph ${n} of a long document`);
  });

  it('reads a file again once it has changed, and keeps it five minutes otherwise', async () => {
    const path = join(roots[0], 'changing.docx');
    await writeFile(path, docxOf(p(r('first version'))));
    let now = 0;
    const one = reader({}, () => now);
    expect((await one.read('changing.docx', 8000, 0)).content).toBe('first version');
    await writeFile(path, docxOf(p(r('second, longer version'))));
    expect((await one.read('changing.docx', 8000, 0)).content).toBe('second, longer version');
    now = 6 * 60 * 1000;
    expect((await one.read('changing.docx', 8000, 0)).content).toBe('second, longer version');
  });

  it('warns about the pages that have no text, and refuses a PDF that has none at all', async () => {
    expect((await reader().read('half.pdf', 8000, 0)).warning).toBe('1 of 2 pages have no text (scans?).');
    await expect(reader().read('scan.pdf', 8000, 0)).rejects.toThrow(/no text layer \(a scan\?\)/);
  });

  it('says what is wrong, in words that say what to do', async () => {
    const why = (path: string, over: Partial<typeof limits> = {}) => reader(over).read(path, 8000, 0).then(() => 'read', (error: Error) => error.message);
    expect(await why('broken.pdf')).toBe('not a readable PDF file');
    expect(await why('broken.docx')).toMatch(/Not a readable Word file/);
    expect(await why('old.doc')).toMatch(/only \.pdf and \.docx files are read, not \.doc/);
    expect(await why('noext')).toMatch(/not a file without an extension/);
    expect(await why('report.pdf', { maxBytes: 100 })).toMatch(/larger than .* \(TW_DOCS_MAX_BYTES\)/);
    expect(await why('report.pdf', { maxPages: 1 })).toMatch(/2 pages.*up to 1 \(TW_DOCS_MAX_PAGES\)/);
    expect(await why('sub')).toMatch(/a folder, not a file/);
  });

  it('will not leave its folders', async () => {
    for (const path of ['../outside.docx', join(base, 'outside.docx')]) {
      await expect(reader().read(path, 8000, 0), path).rejects.toThrow('not found in the folders this server may read');
    }
  });
});

describe('DocumentReader.list', () => {
  it('lists the Word and PDF files and the folders, and nothing else', async () => {
    const listing = await reader().list(undefined);
    const names = listing.entries.map((entry) => `${entry.name}${entry.kind === 'folder' ? '/' : ''}`);
    expect(names).toContain('sub/');
    expect(names).toContain('story.docx');
    expect(names).toContain('report.pdf');
    expect(names).not.toContain('old.doc');
    expect(names).not.toContain('noext');
    expect(names[0]).toBe('sub/');
  });
});
