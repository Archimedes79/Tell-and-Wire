// The way from the graph editor to the notebook, and back at start: a link to the notebook's page on the machine it runs on, with the project to open,
// and the project a link like that names. The two products know each other by this and nothing else (a fixed port, a query); the notebook has a
// copy of its own (`frontend/notebook/document/links.ts`).

/** Where the notebook starts looking for a port (`scripts/start-notebook.mjs`): the editor's is 8000. */
const NOTEBOOK_PORT = 8100;

/** The notebook's page, asked to open the project at *path*; *where* is the editor's own address, whose host the notebook shares. */
export function notebookLink(path: string, where: { protocol: string; hostname: string }): string {
  return `${where.protocol}//${where.hostname}:${NOTEBOOK_PORT}/?open=${encodeURIComponent(path)}`;
}

/** The project a page's address asks to open (`?open=`), or none. */
export function projectAsked(search: string): string | null {
  return new URLSearchParams(search).get('open')?.trim() || null;
}
