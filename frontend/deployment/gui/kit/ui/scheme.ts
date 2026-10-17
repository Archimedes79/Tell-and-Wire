// The colour scheme as the frontend uses it: the scheme's data (`gui/windows/scheme.ts`) as CSS variables.
//
// Every colour in `ui/theme.ts` is a `var()` pointing at one of them, so a block asks for SURFACE and needs to know nothing about
// schemes; the editor paints the same variables on the page's root (`editor/document/store/editorScheme.ts`), under whatever a gui
// sets on its own container.

import { schemeVariables } from '../../../../../gui/windows/scheme.ts';

export * from '../../../../../gui/windows/scheme.ts';

/**
 * The scheme as CSS variables, for the container of a gui: the GUI tab's
 * surface, the App tab, a deployed tool's root.
 *
 * Variables rather than props threaded through the tree: a component asks
 * `ui/theme.ts` for SURFACE and needs to know nothing about schemes, which is
 * what lets one switch repaint every block, border and accent of the GUI
 * without touching a single call site. The map itself is common to every
 * frontend (`schemeVariables`).
 */
export function schemeVars(id: string | undefined): React.CSSProperties {
  return schemeVariables(id) as React.CSSProperties;
}
