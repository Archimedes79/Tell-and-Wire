// The colour scheme as the frontend uses it: the scheme's data (`gui/windows/scheme.ts`) as CSS variables.
//
// Every colour in `ui/theme.ts` is a `var()` pointing at one of them, so a block asks for SURFACE and needs to know nothing about
// schemes; the editor paints the same variables on the page's root (`editor/document/store/editorScheme.ts`), under whatever a gui
// sets on its own container.

import { plotColours, scheme } from '../../../../../gui/windows/scheme.ts';

export * from '../../../../../gui/windows/scheme.ts';

/**
 * The scheme as CSS variables, for the container of a gui: the GUI tab's
 * surface, the App tab, a deployed tool's root.
 *
 * Variables rather than props threaded through the tree: a component asks
 * `ui/theme.ts` for SURFACE and needs to know nothing about schemes, which is
 * what lets one switch repaint every block, border and accent of the GUI
 * without touching a single call site.
 */
export function schemeVars(id: string | undefined): React.CSSProperties {
  const s = scheme(id);
  return {
    '--ui-sunken': s.sunken,
    '--ui-surface': s.surface,
    '--ui-line': s.line,
    '--ui-raise': s.raise,
    '--ui-hover': s.hover,
    '--ui-scrim': s.scrim,
    '--ui-text': s.text,
    '--ui-muted': s.muted,
    '--ui-dim': s.dim,
    '--ui-dimmer': s.dimmer,
    '--ui-accent': s.accent,
    '--ui-accent-text': s.accentText,
    '--ui-accent-fill': s.accentFill,
    '--ui-on-accent': s.onAccent,
    '--ui-success': s.success,
    '--ui-success-text': s.successText,
    '--ui-danger': s.danger,
    '--ui-danger-text': s.dangerText,
    '--ui-warning': s.warning,
    '--ui-warning-text': s.warningText,
    '--ui-purple-text': s.purpleText,
    '--ui-event': s.event,
    '--ui-on-signal': s.onSignal,
    ...Object.fromEntries(Object.entries(s.ink).map(([kind, colour]) => [`--ui-ink-${kind}`, colour])),
    ...Object.fromEntries(plotColours(id).map((colour, index) => [`--plot-${index + 1}`, colour])),
    // Scrollbars, form controls and the window's own backdrop follow, so a
    // light scheme is light to the edges instead of a light gui on a dark desk.
    colorScheme: s.light ? 'light' : 'dark',
  } as React.CSSProperties;
}
