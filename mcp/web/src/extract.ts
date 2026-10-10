// The readable part of a web page, as Markdown, with what the page says about itself.
//
// Defuddle does the reading, on a linkedom document. Neither runs the page's
// scripts: what the server sent is what is read.

import { Defuddle } from 'defuddle/node';
import { parseHTML } from 'linkedom';

export interface Extracted {
  title: string;
  author: string;
  published: string;
  site: string;
  language: string;
  wordCount: number;
  markdown: string;
}

export async function extract(html: string, url: string): Promise<Extracted> {
  const { document } = parseHTML(html);
  // linkedom's document is the DOM Defuddle asks for; the project has no DOM types of its own.
  const page = await Defuddle(document as unknown as Parameters<typeof Defuddle>[0], url, { markdown: true });
  return {
    title: (page.title ?? '').trim(),
    author: (page.author ?? '').trim(),
    published: (page.published ?? '').trim(),
    site: (page.site ?? '').trim(),
    language: (page.language ?? '').trim(),
    wordCount: page.wordCount ?? 0,
    markdown: (page.content ?? '').trim(),
  };
}
