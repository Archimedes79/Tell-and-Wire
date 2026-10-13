// The editor's own colour scheme: the four the GUI has, or whichever the system is in.
//
// A scheme is a set of CSS variables (`ui/scheme.ts`), and every colour of the editor is a `var()`
// that asks for one, so painting the editor is putting the variables on the page's root. A GUI
// sets its own on its own container, over these: what a tool will look like is what its GUI shows
// whatever the editor around it wears.
//
// Kept in the browser, not in the tool: how a person likes their editor is theirs, and a tool
// handed to someone else is not made to look like anyone's editor.

import { create } from 'zustand';
import { DEFAULT_SCHEME, SCHEMES, schemeVars, type SchemeId } from '../../../deployment/gui/kit/ui/scheme';

/** A scheme, or `auto`: Night while the system is dark, Modern White while it is light. */
export type EditorSchemeChoice = SchemeId | 'auto';

const KEY = 'tell-and-wire.editor-scheme';
const WHEN_DARK: SchemeId = 'night';
const WHEN_LIGHT: SchemeId = DEFAULT_SCHEME;

/** What the choice is now: itself, or what the system asks for. */
export function resolvedScheme(choice: EditorSchemeChoice, systemIsLight: boolean): SchemeId {
  if (choice !== 'auto') return choice;
  return systemIsLight ? WHEN_LIGHT : WHEN_DARK;
}

/** The system's own, where the browser says; dark where it does not. */
function systemIsLight(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches;
  } catch {
    return false;
  }
}

/** What the browser remembers of the last choice; White when it remembers none -- or cannot. */
function remembered(): EditorSchemeChoice {
  try {
    const kept = localStorage.getItem(KEY);
    if (kept === 'auto' || SCHEMES.some((one) => one.id === kept)) return kept as EditorSchemeChoice;
  } catch {
    // A browser that keeps nothing starts in White.
  }
  return DEFAULT_SCHEME;
}

/** What a scheme is painted on: the root element of a page, or anything that takes variables and a colour scheme. */
interface Paintable {
  style: { setProperty(name: string, value: string): void; colorScheme: string };
}

/** Put the scheme on the page's root: its variables, and its colour scheme for scrollbars and native controls. */
export function paintEditor(id: SchemeId, root: Paintable | undefined = typeof document === 'undefined' ? undefined : document.documentElement): void {
  if (!root) return;
  for (const [name, value] of Object.entries(schemeVars(id))) {
    if (name.startsWith('--')) root.style.setProperty(name, String(value));
    else if (name === 'colorScheme') root.style.colorScheme = String(value);
  }
}

interface EditorSchemeStore {
  choice: EditorSchemeChoice;
  /** The scheme in use: the choice, or what `auto` comes to. */
  resolved: SchemeId;
  choose: (choice: EditorSchemeChoice) => void;
}

export const useEditorScheme = create<EditorSchemeStore>()((set) => {
  const choice = remembered();
  return {
    choice,
    resolved: resolvedScheme(choice, systemIsLight()),
    choose: (next) => {
      try {
        localStorage.setItem(KEY, next);
      } catch {
        // Not kept; used all the same until the page is closed.
      }
      const resolved = resolvedScheme(next, systemIsLight());
      paintEditor(resolved);
      set({ choice: next, resolved });
    },
  };
});

/**
 * Paint the editor before it is drawn, and follow the system while the choice is `auto`. Called
 * once, from the entry point.
 */
export function startEditorScheme(): void {
  paintEditor(useEditorScheme.getState().resolved);
  try {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      const { choice } = useEditorScheme.getState();
      if (choice === 'auto') useEditorScheme.getState().choose('auto');
    });
  } catch {
    // No media queries: `auto` stays what it was at the start.
  }
}
