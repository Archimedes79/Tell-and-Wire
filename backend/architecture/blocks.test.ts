import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The software is cut the way the picture is (`docs/images/overview.svg`), and "The overview, block by block" in
 * docs/architecture.md takes the picture apart: each box with the folders it is. This holds that section to both ends -- every box
 * of the picture is described in it, every folder it names exists, and no folder of the source is left out -- so the
 * picture, its description and the folders cannot drift apart without a test saying so.
 */

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..');
const doc = readFileSync(join(ROOT, 'docs', 'architecture.md'), 'utf8');
const picture = readFileSync(join(ROOT, 'docs', 'images', 'overview.svg'), 'utf8');

/** The section of the document that describes the picture. */
const section = ((): string => {
  const from = doc.indexOf('## The overview, block by block');
  const to = doc.indexOf('\n## ', from + 1);
  return doc.slice(from, to);
})();

/** The folders a section names, as `root/…/` in code: the way the document says "this box is these folders". */
const named = (text: string): Set<string> => new Set([...text.matchAll(/`((?:graph|gui|backend|frontend|mcp|scripts|docs|examples|notebook-examples)\/(?:[\w.-]+\/)*)`/g)].map((found) => found[1]));

/** Folders that are not source: what is built, what a run leaves, what an editor keeps. */
const NOT_SOURCE = new Set(['node_modules', 'dist', 'output', 'test', 'tests', 'src', 'scripts']);

const folders = (dir: string): string[] => {
  try {
    return readdirSync(join(ROOT, dir)).filter((name) => !name.startsWith('.') && !NOT_SOURCE.has(name) && statSync(join(ROOT, dir, name)).isDirectory());
  } catch {
    return [];
  }
};

/**
 * The folders the picture is made of: the first level under each root, and one more under the roots that are cut by product or by
 * role (`backend/deployment/runtime/`, `frontend/editor/graph/`) -- below that are the kinds of a node and a block, which the
 * document describes in "Elements".
 */
function required(): string[] {
  const found: string[] = [];
  for (const root of ['graph', 'gui', 'backend', 'frontend', 'mcp']) {
    for (const name of folders(root)) {
      found.push(`${root}/${name}/`);
      const deeper = root === 'backend' ? ['deployment', 'editor'] : root === 'frontend' ? ['deployment', 'editor', 'notebook'] : [];
      if (deeper.includes(name)) for (const inner of folders(`${root}/${name}`)) found.push(`${root}/${name}/${inner}/`);
    }
  }
  return found;
}

/** What each box of the picture is called there; the document names it in bold. */
const BOXES: [picture: string, document: string][] = [
  ['GUI editor', 'GUI editor'], ['Graph editor', 'Graph editor'], ['Editor backend', 'Editor backend'],
  ['Page', 'Page'], ['Cells', 'Cells'], ['Notebook backend', 'Notebook backend'],
  ['Browser', 'Browser'], ['Session host', 'Session host'], ['Graph execution', 'Graph execution engine'], ['AI at run time', 'AI at run time'],
];

describe('the picture and its description', () => {
  it('are found, so the checks below look at something', () => {
    expect(section.length).toBeGreaterThan(2000);
    expect(picture).toContain('<svg');
    expect(named(section).size).toBeGreaterThan(40);
    expect(required().length).toBeGreaterThan(30);
  });

  it('say the same boxes: each one of the picture is described, in bold, with its folders', () => {
    for (const [inPicture, inDocument] of BOXES) {
      expect(picture, `${inPicture} is in the picture`).toContain(`>${inPicture}`);
      expect(section, `${inDocument} is described`).toContain(`**${inDocument}**`);
    }
    for (const common of ['Common code', 'AI that writes']) expect(picture).toContain(`>${common}`);
    expect(section).toContain('### Common code');
    expect(doc).toContain('images/overview.svg');
  });

  it('name only folders that exist', () => {
    expect([...named(section)].filter((folder) => !existsSync(join(ROOT, folder)))).toEqual([]);
  });

  it('leave no folder of the source out', () => {
    const left = required().filter((folder) => !named(section).has(folder));
    expect(left).toEqual([]);
  });
});
