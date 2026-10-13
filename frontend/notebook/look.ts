// How the notebook itself looks, light or dark: its own choice, kept in the browser (not in any file: it is the person's, not the
// tool's). The look of the tool that is delivered is another choice, made per document (`doc.scheme`).

export type Look = 'light' | 'dark';

const KEY = 'tw-notebook-look';

/** A stored value as a look: anything that is not "dark" is the white default. */
export const parseLook = (value: unknown): Look => (value === 'dark' ? 'dark' : 'light');

/** The look kept in this browser; light where there is none or storage is closed. */
export function savedLook(): Look {
  try {
    return parseLook(localStorage.getItem(KEY));
  } catch {
    return 'light';
  }
}

/** Paint *look* on the page (the variables of `notebook.css` follow `data-look`) and keep it. */
export function applyLook(look: Look): void {
  document.documentElement.dataset.look = look;
  try {
    localStorage.setItem(KEY, look);
  } catch {
    // The look still holds for this page; it is not kept.
  }
}
