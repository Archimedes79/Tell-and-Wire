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

/** What Tell & Wire is, in a few lines, with the version running: the last chapter. Claims here are the README's, no more. */
export function aboutText(version: string): string {
  return [
    `# About Tell & Wire ${version}`,
    '',
    'A visual node editor for AI workflows and small local tools. You say in plain words what each node should do, a model writes it, you wire the nodes into a graph, give it a GUI, and hand it on as a folder that runs wherever Node runs -- offline, with a local model, if you like.',
    '',
    '- **Local.** The editor and every deployed tool listen on this computer only. There is no telemetry and no account. Only the AI you choose receives what you send it.',
    '- **MCP, in two ways.** Tell & Wire serves an MCP server, so an AI assistant can design, check, save, run and test graphs (`--mcp`, see the user guide, chapter 11). And an AI node can use the tools of MCP servers: a web reader and a Word and PDF reader come with it.',
    '- **Licence.** PolyForm Noncommercial 1.0.0: source-available, free for noncommercial use.',
    '- **Source, downloads, issues.** [github.com/Archimedes79/Tell-and-Wire](https://github.com/Archimedes79/Tell-and-Wire)',
    '',
    'Names of other products are their owners\' trademarks. Tell & Wire is not affiliated with them.',
  ].join('\n');
}

/** What Help shows: Getting started first, then the guide's chapters in its order, then About. */
export const CHAPTERS: Chapter[] = [
  ...helpChapters(started, guide),
  { id: 'about', title: 'About', body: aboutText(typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '') },
];
