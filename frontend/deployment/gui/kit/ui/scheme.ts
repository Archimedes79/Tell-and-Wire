// The colour scheme: one choice for the whole tool, from a closed set.
//
// A scheme is the entire palette -- gui, panels, borders, text, accent, the
// tint behind a node -- not an accent colour. What people mean by a colour
// scheme is dark blue versus warm paper, and that is what these are.
//
// It is the GUI's scheme: every value here becomes a CSS variable on the
// gui's own container (see schemeVars) -- the GUI surface of the GUI tab,
// the App tab, the delivered tool -- and every colour in `ui/theme.ts` is a
// `var()` pointing at one, so a block asks for SURFACE and needs to know
// nothing about schemes. The editor around it paints the same variables on the
// page's root (below); what is after the comma in `ui/theme.ts` is Night, for a
// page that has painted none.
//
// Text on a surface meets 4.5:1 in every scheme -- `text`, `muted`, `dim`,
// `dimmer` and each `...Text` colour, on the GUI, the panels, a raised block
// and a hovered row. `scheme.test.ts` checks it.
//
// The editor has the same choice (Settings → Appearance, `editor/document/store/editorScheme.ts`): the
// same variables on the page's root, under whatever a GUI sets on its own container, so the
// editor can be light around a GUI that is dark and the other way round.
//
// Four: Night and Graphite (two darks that are not the same), Paper and White (a warm light and a bright one). Enough that the tool
// can look like the person using it, few enough that every colour pair of every one is checked
// (`scheme.test.ts`) and every window can be looked at in each: a scheme that is not is not
// offered. A colour picker is how interfaces get ugly,
// and each of these was balanced as a whole rather than picked as a hue. An accent that reads on
// white would vanish on Night, which is why a scheme is a palette and not a colour.
//
// Stored on `metadata.gui_scheme`: presentation of the graph as a whole, so it
// travels with the file and a deployed tool looks like what was designed.

export type SchemeId = 'night' | 'paper' | 'white' | 'modern' | 'graphite';

/**
 * The scheme of whoever, or whatever, names none: the editor of a person who has not chosen, and a
 * tool whose file says nothing. `defaultMetadata` in `graph/graph.ts` repeats the id, as that
 * package imports nothing of the frontend; `scheme.test.ts` keeps the two equal.
 */
export const DEFAULT_SCHEME: SchemeId = 'modern';

/** What a graph saved with a scheme that is no longer offered shows in: the nearest. */
const LEGACY: Record<string, SchemeId> = { office: 'white', anthracite: 'graphite' };

interface Scheme {
  id: SchemeId;
  label: string;
  /** A light scheme. A few affordances need to know which way is up. */
  light?: boolean;

  // ---- surfaces -------------------------------------------------------------
  /** Recessed: the GUI itself, input fields, code areas. */
  sunken: string;
  /** Raised: panels, modals, nodes, cards. */
  surface: string;
  /** Borders, and the neutral button fill -- the same colour by design. */
  line: string;
  /** The barely-there lift of a block off the GUI. */
  raise: string;
  /** A row or button under the pointer. */
  hover: string;
  /** Behind a modal. */
  scrim: string;

  // ---- text -----------------------------------------------------------------
  text: string;
  muted: string;
  dim: string;
  dimmer: string;

  // ---- accent ---------------------------------------------------------------
  accent: string;
  /** Accent-coloured text on a normal surface. */
  accentText: string;
  /** The accent at low opacity: tinted notes, the `accent` tone's fill. */
  accentFill: string;
  /** Text on top of the accent itself -- a button's label. */
  onAccent: string;
  /** What the AI does -- a button that writes, a chat's send, the sparkle: its own colour, so it is told from what the person does. */
  ai: string;
  /** Text on top of `ai`. */
  onAi: string;
  /** The first colour of a chart, where the accent would not do for it (a near-black accent). */
  plot?: string;

  // ---- meaning --------------------------------------------------------------
  success: string;
  /** Success as text on a normal surface. */
  successText: string;
  danger: string;
  dangerText: string;
  /** Something to look at, not an error: the amber of a warning, for fills and borders. */
  warning: string;
  warningText: string;
  /** The one emphasis that is not the accent: a name picked out in a sentence. */
  purpleText: string;

  /** Text on a success, danger or warning fill -- the mark in a round badge: dark on the bright fills of a dark scheme, white on the deep ones of a light one. */
  onSignal: string;
  /** An event -- the ◆ a run begins at -- as a mark and as text: amber, darker on a light ground, where the bright one would vanish. */
  event: string;
  /** One ink per node type, to draw its icon in and the canvas's map to draw it by: bright on a dark ground, deep on a light one. */
  ink: { ai: string; code: string; data: string; end: string; subgraph: string; start: string };

}

export const SCHEMES: Scheme[] = [
  {
    id: 'night',
    label: 'Night — dark blue',
    sunken: '#0f1117', surface: '#1a1d2e', line: '#2d3148',
    raise: 'rgba(255,255,255,0.03)', hover: 'rgba(255,255,255,0.06)',
    scrim: 'rgba(0,0,0,0.70)',
    text: '#e2e8f0', muted: '#a5b2c3', dim: '#96a0b0', dimmer: '#8c95a1',
    accent: '#6164ec', accentText: '#a5b4fc', accentFill: 'rgba(99,102,241,0.10)', onAccent: '#ffffff',
    ai: '#fb923c', onAi: '#0f1117',
    success: '#22c55e', successText: '#86efac', danger: '#ef4444', dangerText: '#fca5a5',
    warning: '#eab308', warningText: '#fcd34d', purpleText: '#c4b5fd',
    onSignal: '#0f1117',
    event: '#f59e0b',
    ink: { ai: '#cdaef2', code: '#69d3c6', data: '#f2a3c1', end: '#f5b75b', subgraph: '#b3bfd2', start: '#f5b75b' },
  },
  {
    id: 'paper',
    label: 'Paper — light and warm',
    light: true,
    // Warm off-white rather than #fff, and ink rather than black: a GUI you can
    // look at for an afternoon. The accent is a burnt orange, the one hue that
    // stays legible both as a 1px border and as a filled button.
    sunken: '#efece3', surface: '#faf9f5', line: '#dcd8cb',
    raise: 'rgba(60,50,30,0.035)', hover: 'rgba(60,50,30,0.06)',
    scrim: 'rgba(35,32,26,0.45)',
    text: '#22201c', muted: '#4e4b46', dim: '#5b5853', dimmer: '#64615b',
    accent: '#b85b36', accentText: '#8f4526', accentFill: 'rgba(192,95,56,0.10)', onAccent: '#ffffff',
    ai: '#b85b36', onAi: '#ffffff',
    success: '#2f7d32', successText: '#25652a', danger: '#b3261e', dangerText: '#8c1d18',
    warning: '#b45309', warningText: '#8a4108', purpleText: '#5b21b6',
    onSignal: '#ffffff',
    event: '#a8480a',
    ink: { ai: '#6b3fa0', code: '#0f6b63', data: '#a21c58', end: '#9a5b0a', subgraph: '#475569', start: '#9a5b0a' },
  },
  {
    id: 'white',
    label: 'White — bright and clean',
    light: true,
    // White paper with grey boxes on it, which is what a document looks like
    // in every office program. The blue is the one people already read as
    // "this is the control", so nothing has to be learned.
    sunken: '#f4f5f7', surface: '#ffffff', line: '#d8dbe0',
    raise: 'rgba(16,24,40,0.03)', hover: 'rgba(16,24,40,0.06)',
    scrim: 'rgba(16,24,40,0.45)',
    text: '#1a1d23', muted: '#4a515c', dim: '#585e6a', dimmer: '#63676f',
    accent: '#2563eb', accentText: '#1d4ed8', accentFill: 'rgba(37,99,235,0.08)', onAccent: '#ffffff',
    ai: '#c2410c', onAi: '#ffffff',
    success: '#15803d', successText: '#166534', danger: '#b42318', dangerText: '#912018',
    warning: '#b45309', warningText: '#8a4108', purpleText: '#5b21b6',
    onSignal: '#ffffff',
    event: '#b45309',
    ink: { ai: '#6d28d9', code: '#0f766e', data: '#be185d', end: '#b45309', subgraph: '#475569', start: '#b45309' },
  },
  {
    id: 'modern',
    label: 'Modern White — black, orange',
    light: true,
    // The White ground with the blue taken out: the main button is near-black, so the one
    // thing that is a colour is what the AI does -- orange. A chosen card has a black ring, a
    // chosen wire is black; the rest is grey, thin frames and soft shadows. `docs/modern-white.md`.
    sunken: '#f3f4f6', surface: '#ffffff', line: '#dde0e5',
    raise: 'rgba(16,24,40,0.03)', hover: 'rgba(16,24,40,0.06)',
    scrim: 'rgba(16,24,40,0.45)',
    text: '#16181d', muted: '#4f5562', dim: '#5b616e', dimmer: '#636a76',
    accent: '#16181d', accentText: '#16181d', accentFill: 'rgba(22,24,29,0.06)', onAccent: '#ffffff',
    ai: '#c2410c', onAi: '#ffffff',
    plot: '#2448a6',
    success: '#1f7a4d', successText: '#166534', danger: '#b42323', dangerText: '#912018',
    warning: '#b45309', warningText: '#8a4108', purpleText: '#5b21b6',
    onSignal: '#ffffff',
    event: '#b45309',
    ink: { ai: '#6d28d9', code: '#0f766e', data: '#be185d', end: '#b45309', subgraph: '#475569', start: '#b45309' },
  },
  {
    id: 'graphite',
    label: 'Graphite — neutral dark',
    // Neutral grey with a teal accent: darker than a screen in daylight wants, lighter than a
    // room with the lights off wants -- the second dark scheme, which is not Night in another blue.
    sunken: '#111113', surface: '#1b1b1f', line: '#33333a',
    raise: 'rgba(255,255,255,0.04)', hover: 'rgba(255,255,255,0.07)',
    scrim: 'rgba(0,0,0,0.70)',
    text: '#e8e8ea', muted: '#b3b3b9', dim: '#a1a1a5', dimmer: '#96969a',
    accent: '#2dd4bf', accentText: '#5eead4', accentFill: 'rgba(45,212,191,0.12)', onAccent: '#06231f',
    ai: '#fb923c', onAi: '#111113',
    success: '#34d399', successText: '#86efac', danger: '#f87171', dangerText: '#fca5a5',
    warning: '#eab308', warningText: '#fcd34d', purpleText: '#c4b5fd',
    onSignal: '#0f1117',
    event: '#f59e0b',
    ink: { ai: '#cdaef2', code: '#69d3c6', data: '#f2a3c1', end: '#f5b75b', subgraph: '#b3bfd2', start: '#f5b75b' },
  },
];

/**
 * Colours for telling series apart, one set per kind of GUI.
 *
 * Not per scheme: what makes eight colours distinguishable is how they sit on a
 * dark or a light ground, and there are only those two grounds. The first of
 * the eight is always the scheme's own accent, so a one-series chart matches
 * the GUI it is on. A chart -- or SVG that arrives at one -- reaches them as
 * `var(--plot-1)` … `var(--plot-8)`, which is how it keeps working when the
 * scheme is changed.
 */
const PLOT_ON_DARK = ['#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#a78bfa', '#84cc16', '#fb923c'];
const PLOT_ON_LIGHT = ['#15803d', '#b45309', '#be185d', '#0e7490', '#6d28d9', '#4d7c0f', '#c2410c'];

export function plotColours(id: string | undefined): string[] {
  const s = scheme(id);
  return [s.plot ?? s.accent, ...(s.light ? PLOT_ON_LIGHT : PLOT_ON_DARK)];
}

export function scheme(id: string | undefined): Scheme {
  const named = LEGACY[id ?? ''] ?? id;
  return SCHEMES.find((s) => s.id === named) ?? SCHEMES.find((s) => s.id === DEFAULT_SCHEME) ?? SCHEMES[0];
}

/**
 * The scheme as CSS variables, for the container of a GUI: the GUI tab's
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
    '--ui-ai': s.ai,
    '--ui-on-ai': s.onAi,
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
