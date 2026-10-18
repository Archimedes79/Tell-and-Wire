/**
 * Draws the detailed architecture: `docs/images/overview-detail.svg` and the five pages `docs/images/architecture-files-*.svg`.
 *
 *     node backend/architecture/draw.ts            write them
 *     node backend/architecture/draw.ts --check    say which are out of date, and change nothing
 *
 * They are made, not drawn: the pages from "The files" in docs/architecture.md, the overview from `overviewDetail.ts` and the README's
 * picture. `drawings.test.ts` runs the same check, so a change to the folders, the document or the README's picture fails there until
 * this has been run.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { FILE_PAGES, filePage } from './filePages.ts';
import { overviewDetail } from './overviewDetail.ts';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const IMAGES = join(ROOT, 'docs', 'images');

/** Every drawing with the text it should have now, by its file name under `docs/images/`. */
export function drawings(): Map<string, string> {
  const doc = readFileSync(join(ROOT, 'docs', 'architecture.md'), 'utf8');
  const readme = readFileSync(join(IMAGES, 'overview.svg'), 'utf8');
  const made = new Map<string, string>();
  made.set('overview-detail.svg', overviewDetail(readme));
  for (const page of FILE_PAGES) made.set(page.file, filePage(doc, page));
  return made;
}

/** The text a drawing has on disk, or nothing when there is none. */
export function onDisk(file: string): string | undefined {
  try {
    return readFileSync(join(IMAGES, file), 'utf8');
  } catch {
    return undefined;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const [file, text] of drawings()) {
    if (onDisk(file) === text) continue;
    stale += 1;
    if (check) console.log(`out of date: docs/images/${file}`);
    else {
      writeFileSync(join(IMAGES, file), text);
      console.log(`written: docs/images/${file}`);
    }
  }
  if (!stale) console.log('every drawing is up to date');
  if (check && stale) process.exitCode = 1;
}
