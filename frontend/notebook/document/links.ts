// The way from the notebook to the graph editor, and back at start: the editor is asked to open the project at a path (the server finds it where it
// runs, or starts it: `backend/authoring/product.ts`), and the project a link to this page names. The editor has a copy of the second half of its
// own (`frontend/editor/app/notebookLink.ts`).

/** The project a page's address asks to open (`?open=`), or none. */
export function projectAsked(search: string): string | null {
  return new URLSearchParams(search).get('open')?.trim() || null;
}

/**
 * Show the person the other product with the project open. The tab is opened first, in the click, which is what a browser allows, and sent where
 * the server says once it knows -- which may take a while, for a product that has to be started. A failure closes it again and is thrown.
 */
export async function switchTab(where: () => Promise<string>): Promise<void> {
  const tab = window.open('', '_blank');
  try {
    const url = await where();
    if (tab) { tab.opener = null; tab.location.href = url; } else window.location.href = url;
  } catch (error) {
    tab?.close();
    throw error;
  }
}
