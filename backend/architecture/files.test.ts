import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { filesUnder } from './filesUnder.ts';

/**
 * "The files" in docs/architecture.md says where each source file is and what it does. This holds it to the tree, both ways: every
 * source file is in the section (by its path, or by the pattern of a kind's files), and every row of it is a file there is -- so a file
 * added, moved or removed without a word there fails here, as the folders do in `blocks.test.ts`.
 */

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const doc = readFileSync(join(ROOT, 'docs', 'architecture.md'), 'utf8');

const section = ((): string => {
  const from = doc.indexOf('\n## The files\n');
  const to = doc.indexOf('\n## ', from + 1);
  return doc.slice(from, to);
})();

/** What a row names, in the first column: paths, or patterns for the files of a kind. */
const named = [...section.matchAll(/^\| ((?:`[^`]+`(?:, )?)+) \|/gm)].flatMap((row) => [...row[1].matchAll(/`([^`]+)`/g)].map((one) => one[1]));

/** A pattern as a regular expression: `<kind>` is a folder name, `<Kind>` a class prefix, `*` anything in a name. */
function matcher(entry: string): RegExp {
  const escaped = entry.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/<kind>/g, '[a-z_]+').replace(/<Kind>/g, '[A-Za-z]+').replace(/\*/g, '[A-Za-z]*')}$`);
}
const matchers = named.map((entry) => ({ entry, test: matcher(entry) }));
const isPattern = (entry: string): boolean => /[<*]/.test(entry);

const SOURCE = /\.(ts|tsx|mjs|js|cjs|css|html|cmd|ps1|sh)$/;
const NOT_SOURCE = /\.(test\.(ts|tsx|mjs)|d\.ts)$/;

/** Every source file of the tree, by its path from the root. */
function sourceFiles(): string[] {
  const found: string[] = [];
  for (const area of ['graph', 'gui', 'backend', 'frontend', 'mcp', 'scripts']) {
    for (const file of filesUnder(join(ROOT, area), ['node_modules', 'dist', 'output'])) found.push(relative(ROOT, file).replace(/\\/g, '/'));
  }
  for (const name of readdirSync(ROOT)) if (/^[^.].*\.(cmd|ps1|sh)$/.test(name)) found.push(name);
  return found.filter((file) => SOURCE.test(file) && !NOT_SOURCE.test(file)).sort();
}

describe('the files, as docs/architecture.md says them', () => {
  it('has rows to hold the tree to', () => {
    expect(named.length).toBeGreaterThan(100);
  });

  it('names every source file, by its path or by the pattern of a kind\'s files', () => {
    const missing = sourceFiles().filter((file) => !matchers.some((one) => one.test.test(file)));
    expect(missing).toEqual([]);
  });

  it('names only files there are: a path that exists, a pattern that matches one', () => {
    const files = sourceFiles();
    const gone = matchers.filter(({ entry, test }) => (isPattern(entry) ? !files.some((file) => test.test(file)) : !existsSync(join(ROOT, entry)))).map((one) => one.entry);
    expect(gone).toEqual([]);
  });

  it('names no file twice', () => {
    const twice = named.filter((entry, at) => named.indexOf(entry) !== at);
    expect(twice).toEqual([]);
  });
});
