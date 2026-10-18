import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { drawings, onDisk } from './draw.ts';
import { FILE_PAGES, fileRows, rowsOf } from './filePages.ts';
import { filesUnder } from './filesUnder.ts';
import { BOXES, keyFiles, shown } from './overviewDetail.ts';

/**
 * The detailed architecture is drawn, and kept in step with what it shows.
 *
 * `docs/images/overview-detail.svg` is the README's picture with each box's folders and key files; the five `architecture-files-*.svg`
 * are the file map by area. `node backend/architecture/draw.ts` makes them -- the pages from "The files" in docs/architecture.md, the
 * overview from `overviewDetail.ts` and the README's picture -- and this holds that they are what it makes now, and that what the
 * overview says of each box is in the tree and in the document's table of that box.
 */

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const doc = readFileSync(join(ROOT, 'docs', 'architecture.md'), 'utf8');
const readme = readFileSync(join(ROOT, 'docs', 'images', 'overview.svg'), 'utf8');
const detail = readFileSync(join(ROOT, 'docs', 'images', 'overview-detail.svg'), 'utf8');

const section = ((): string => {
  const from = doc.indexOf('## The overview, block by block');
  const to = doc.indexOf('\n## ', from + 1);
  return doc.slice(from, to);
})();

/** Every file of the tree, from the root. */
const FILES = ['graph', 'gui', 'backend', 'frontend', 'mcp', 'scripts'].flatMap((area) => filesUnder(join(ROOT, area), ['node_modules', 'dist', 'output']))
  .map((file) => relative(ROOT, file).split('\\').join('/'));

/** A path of the drawing as a regular expression, when it stands for many: `<kind>` is a folder name, `<Kind>` a class prefix, `*` a name. */
function matcher(path: string): RegExp {
  const escaped = path.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/<kind>/g, '[a-z_]+').replace(/<Kind>/g, '[A-Za-z]+').replace(/\*/g, '[^/]*')}$`);
}

/** Whether a path of the drawing is there: a folder, a file, or a pattern that matches some. */
function exists(path: string): boolean {
  if (/[<*]/.test(path)) return FILES.some((file) => matcher(path).test(file));
  const at = join(ROOT, path);
  return existsSync(at) && (path.endsWith('/') ? statSync(at).isDirectory() : statSync(at).isFile());
}

/** The rows of the document's overview: by the heading they stand under and their name, the folders each names. */
function tableRows(): Map<string, string[]> {
  const rows = new Map<string, string[]>();
  let heading = '';
  for (const line of section.split('\n')) {
    if (line.startsWith('### ')) heading = line.slice(4).trim();
    const found = /^\| (.+?) \| ((?:`[^`]+`(?:, )?)+) \|/.exec(line);
    if (found) rows.set(`${heading}|${found[1]}`, [...found[2].matchAll(/`([^`]+)`/g)].map((one) => one[1]));
  }
  return rows;
}

/** The paths some words name, as the tree has them: braces opened, a trailing full stop or comma dropped. */
function pathsIn(words: string[]): string[] {
  const found = words.flatMap((text) => [...text.matchAll(/\b(?:graph|gui|backend|frontend|mcp)\/[\w./{},*<>-]*/g)].map((one) => one[0].replace(/[.,;:]+$/, '')));
  return found.flatMap((path) => {
    const open = /^(.*)\{([^}]*)\}(.*)$/.exec(path);
    return open ? open[2].split(',').map((name) => `${open[1]}${name}${open[3]}`) : [path];
  });
}

/** The text of a drawing's words, as written. */
const wordsOf = (svg: string): string[] => [...svg.matchAll(/<text[^>]*>([^<]*)</g)].map((one) => one[1].split('&lt;').join('<').split('&gt;').join('>').split('&amp;').join('&'));

/** What a box writes of its key files is relative to its folders (`graph/generate.ts` in the editor's backend): those words are not paths from the root. */
const relativeWords = BOXES.flatMap((box) => (box.entries ?? []).map((entry) => `${shown(box, entry)} ${entry.role}`));

describe('the detailed architecture, drawn', () => {
  it('is found, so the checks below look at something', () => {
    expect(BOXES.length).toBeGreaterThan(15);
    expect(keyFiles().length).toBeGreaterThan(40);
    expect(fileRows(doc).length).toBeGreaterThan(300);
    expect(FILES.length).toBeGreaterThan(500);
    expect(detail).toContain('<svg');
  });

  it('is what the document, the tree and the README make of it now: run `node backend/architecture/draw.ts` when this fails', () => {
    for (const [file, text] of drawings()) expect(onDisk(file) === text, `docs/images/${file} is out of date`).toBe(true);
  });

  it('shows every row of "The files" on one page', () => {
    expect(FILE_PAGES.reduce((sum, page) => sum + rowsOf(doc, page).length, 0)).toBe(fileRows(doc).length);
  });

  it('names only folders and key files that exist', () => {
    const missing = [...new Set([...BOXES.flatMap((box) => box.folders ?? []), ...keyFiles()])].filter((path) => !exists(path));
    expect(missing).toEqual([]);
  });

  it('says in its words only paths that exist', () => {
    const relative = new Set(pathsIn(relativeWords));
    const paths = pathsIn(wordsOf(detail)).filter((path) => !relative.has(path));
    expect(paths.length).toBeGreaterThan(20);
    expect([...new Set(paths)].filter((path) => !exists(path))).toEqual([]);
  });

  it("gives each box the folders its table in the document names: none left out, none that the table does not give it", () => {
    const table = tableRows();
    const problems: string[] = [];
    for (const box of BOXES.filter((one) => one.doc)) {
      const [heading, name] = box.doc as [string, string];
      const named = table.get(`${heading}|${name}`);
      if (!named) {
        problems.push(`${box.title}: no row "${name}" under "${heading}"`);
        continue;
      }
      const folders = box.folders ?? [];
      for (const folder of folders) if (!named.includes(folder)) problems.push(`${box.title}: ${folder} is not in its table`);
      // a folder the table gives that holds others it gives (`backend/editor/`) is no box of its own; each other is covered by one the box names
      const parents = (one: string): boolean => named.some((other) => other !== one && other.startsWith(one));
      for (const one of named.filter((path) => !parents(path))) {
        if (!folders.some((folder) => one.startsWith(folder))) problems.push(`${box.title}: ${one} is in its table, not in the box`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("has every box of the README's picture", () => {
    const boxes = ['GUI editor', 'Graph editor', 'Editor backend', 'Page', 'Cells', 'Notebook backend', 'Browser', 'Session host', 'Graph execution', 'AI at run time', 'Common code', 'AI that writes'];
    for (const box of boxes) {
      expect(readme, `${box} is in the README's picture`).toContain(`>${box}`);
      expect(detail, `${box} is in the detailed one`).toContain(`>${box}<`);
    }
  });
});
