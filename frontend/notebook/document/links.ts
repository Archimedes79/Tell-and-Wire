// The way from the notebook to the graph editor, and back at start: a link to the editor's page on the machine it runs on, with the project to open,
// and the project a link like that names. The two products know each other by this and nothing else (a fixed port, a query); the editor has a
// copy of its own (`frontend/editor/app/notebookLink.ts`).

/** Where the editor starts looking for a port (`scripts/start.mjs`). */
const EDITOR_PORT = 8000;

/** The editor's page, asked to open the project at *path*; *where* is the notebook's own address, whose host the editor shares. */
export function editorLink(path: string, where: { protocol: string; hostname: string }): string {
  return `${where.protocol}//${where.hostname}:${EDITOR_PORT}/?open=${encodeURIComponent(path)}`;
}

/** The project a page's address asks to open (`?open=`), or none. */
export function projectAsked(search: string): string | null {
  return new URLSearchParams(search).get('open')?.trim() || null;
}
