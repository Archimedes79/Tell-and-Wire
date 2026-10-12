// The help: the getting-started page and the user guide, cut into chapters.
//
// Both are the markdown files in docs/, bundled with the editor -- the guide is written once and
// read where it is needed, not kept in a second copy. A chapter is what is under one `## `
// heading; what comes before the first is the guide's introduction.

import started from '../../../docs/getting-started.md?raw';
import guide from '../../../docs/user-guide.md?raw';

export interface Chapter {
  id: string;
  title: string;
  body: string;
}

/** Where a link out of docs/ goes: the file is not in the editor, but it is in the repository. */
const REPOSITORY = 'https://github.com/Archimedes79/Tell-and-Wire/blob/main/';

/** Links that climb out of docs/ (`../README.md`) point at the repository, where a reader of the editor can follow them. */
export function absolutized(markdown: string): string {
  return markdown.replace(/\]\(\.\.\/([^)]*)\)/g, `](${REPOSITORY}$1)`);
}

/** The chapters of *guide*, after *first*: one for what is before its first `## `, then one for each. */
export function helpChapters(first: string, text: string): Chapter[] {
  const chapters: Chapter[] = [{ id: 'getting-started', title: 'Getting started', body: absolutized(first) }];
  const parts = text.split(/^(?=## )/m);
  parts.forEach((part, index) => {
    const heading = /^## (.*)$/m.exec(part);
    const title = index === 0 || !heading ? 'The user guide' : heading[1].trim();
    if (!part.trim()) return;
    chapters.push({ id: `guide-${index}`, title, body: absolutized(part) });
  });
  return chapters;
}

/** What Help shows: Getting started first, then the guide's chapters in its order. */
export const CHAPTERS: Chapter[] = helpChapters(started, guide);
