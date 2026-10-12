// The look of the editor itself: one of the colour schemes (`ui/scheme.ts`), chosen by the person at the keyboard and kept in the
// browser. It is not part of any graph -- a tool's own look is `metadata.gui_scheme`, which a delivered tool draws.
//
// The editor's chrome already asks `ui/theme.ts` for every colour, and those are `var()`s with the Night value as the fallback; so
// the look is the scheme's variables put on the page itself, where dialogs and menus (which are drawn outside the editor's root)
// follow it too.

import { create } from 'zustand';
import { SCHEMES, scheme, schemeVars } from '../../../deployment/gui/kit/ui/scheme';
import { SUNKEN, SURFACE } from '../../../deployment/gui/kit/ui/theme';

/** White, unless the person chose otherwise. */
export const DEFAULT_LOOK = 'office';
const KEY = 'tell-and-wire-editor-look';

/** The scheme the editor is in, as the browser remembers it; a name that is no scheme any more is the default. */
export function savedLook(): string {
  try {
    const id = window.localStorage.getItem(KEY);
    if (id && SCHEMES.some((one) => one.id === id)) return id;
  } catch { /* no storage: the default */ }
  return DEFAULT_LOOK;
}

/** Put a scheme on the page: its variables and its colour scheme (native controls and scrollbars). */
export function applyLook(id: string): void {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(schemeVars(id))) {
    if (name.startsWith('--')) root.style.setProperty(name, String(value));
  }
  root.style.colorScheme = scheme(id).light ? 'light' : 'dark';
}

export const useLook = create<{ id: string; choose: (id: string) => void }>((set) => ({
  id: savedLook(),
  choose: (id) => {
    applyLook(id);
    try { window.localStorage.setItem(KEY, id); } catch { /* not kept; it still holds for this page */ }
    set({ id });
  },
}));

/** The editor's tints for a node, by type, in the look it is in: what the minimap paints, where variables do not resolve. */
export const lookNodes = (id: string) => scheme(id).nodes;

/** The ink of a glyph on a status colour (the ✓ on the green): the page's own white on a light look, its dark ground on a dark one. */
export function useOnStatus(): string {
  const id = useLook((state) => state.id);
  return scheme(id).light ? SURFACE : SUNKEN;
}
