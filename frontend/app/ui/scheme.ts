// The colour scheme: one choice for the whole tool, from a closed set.
//
// A scheme is the entire palette -- page, panels, borders, text, accent, the
// tint behind a node -- not an accent colour. What people mean by a colour
// scheme is dark blue versus warm paper, and that is what these are.
//
// It is the PAGE's scheme: every value here becomes a CSS variable on the
// page's own container (see schemeVars) -- the page surface of the Page tab,
// the App tab, the delivered tool -- and every colour in `ui/theme.ts` is a
// `var()` pointing at one, so a block asks for SURFACE and needs to know
// nothing about schemes. The editor around it sets none, and keeps the
// literals after the comma in `ui/theme.ts` (the Night palette) under every
// scheme.
//
// Text on a surface meets 4.5:1 in every scheme -- `text`, `muted`, `dim`,
// `dimmer` and each `...Text` colour, on the page, the panels, a raised block
// and a hovered row. `scheme.test.ts` checks it.
//
// Five: two dark, two light, one in between. Enough that the tool can look
// like the person using it, few enough that none of them is bad -- a colour
// picker is how interfaces get ugly, and each of these was balanced as a whole
// rather than picked as a hue. An accent that reads on white would vanish on
// Nacht, which is why a scheme is a palette and not a colour.
//
// A red one was tried and dropped: red reads as an error on a page that also
// reports errors.
//
// Stored on `metadata.gui_scheme`: presentation of the graph as a whole, so it
// travels with the file and a deployed tool looks like what was designed.

export type SchemeId = 'night' | 'paper' | 'office' | 'graphite' | 'anthracite';

interface Scheme {
  id: SchemeId;
  label: string;
  /** A light scheme. A few affordances need to know which way is up. */
  light?: boolean;

  // ---- surfaces -------------------------------------------------------------
  /** Recessed: the page itself, input fields, code areas. */
  sunken: string;
  /** Raised: panels, modals, nodes, cards. */
  surface: string;
  /** Borders, and the neutral button fill -- the same colour by design. */
  line: string;
  /** The barely-there lift of a block off the page. */
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

  // ---- meaning --------------------------------------------------------------
  success: string;
  /** Success as text on a normal surface. */
  successText: string;
  danger: string;
  dangerText: string;
  /** Something to look at, not an error: the amber of a warning, for fills and borders. */
  warning: string;
  warningText: string;
  /** Information: a note that is neither good nor bad. */
  infoText: string;
  /** The one emphasis that is not the accent: a name picked out in a sentence. */
  purpleText: string;

  /** One tint per node type, so the canvas reads at a glance. */
  nodes: { folder: string; ai: string; code: string; data: string; end: string; subgraph: string; start: string };
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
    success: '#22c55e', successText: '#86efac', danger: '#ef4444', dangerText: '#fca5a5',
    warning: '#eab308', warningText: '#fcd34d', infoText: '#93c5fd', purpleText: '#c4b5fd',
    nodes: { folder: '#1e3a5f', ai: '#2d1b4e', code: '#1a3a2a', data: '#183b3b', end: '#3a2000', subgraph: '#2a2a4a', start: '#4a3a12' },
  },
  {
    id: 'paper',
    label: 'Paper — light and warm',
    light: true,
    // Warm off-white rather than #fff, and ink rather than black: a page you can
    // look at for an afternoon. The accent is a burnt orange, the one hue that
    // stays legible both as a 1px border and as a filled button.
    sunken: '#efece3', surface: '#faf9f5', line: '#dcd8cb',
    raise: 'rgba(60,50,30,0.035)', hover: 'rgba(60,50,30,0.06)',
    scrim: 'rgba(35,32,26,0.45)',
    text: '#22201c', muted: '#4e4b46', dim: '#5b5853', dimmer: '#64615b',
    accent: '#b85b36', accentText: '#8f4526', accentFill: 'rgba(192,95,56,0.10)', onAccent: '#ffffff',
    success: '#2f7d32', successText: '#25652a', danger: '#b3261e', dangerText: '#8c1d18',
    warning: '#b45309', warningText: '#8a4108', infoText: '#1e40af', purpleText: '#5b21b6',
    nodes: { folder: '#dde7f2', ai: '#e6dcf0', code: '#dcecdf', data: '#d8eaea', end: '#f3e3cb', subgraph: '#e2e1ef', start: '#f1e7c9' },
  },
  {
    id: 'office',
    label: 'Office — white with light grey',
    light: true,
    // White paper with grey boxes on it, which is what a document looks like
    // in every office program. The blue is the one people already read as
    // "this is the control", so nothing has to be learned.
    sunken: '#f4f5f7', surface: '#ffffff', line: '#d8dbe0',
    raise: 'rgba(16,24,40,0.03)', hover: 'rgba(16,24,40,0.06)',
    scrim: 'rgba(16,24,40,0.45)',
    text: '#1a1d23', muted: '#4a515c', dim: '#585e6a', dimmer: '#63676f',
    accent: '#2563eb', accentText: '#1d4ed8', accentFill: 'rgba(37,99,235,0.08)', onAccent: '#ffffff',
    success: '#15803d', successText: '#166534', danger: '#b42318', dangerText: '#912018',
    warning: '#b45309', warningText: '#8a4108', infoText: '#1e40af', purpleText: '#5b21b6',
    nodes: { folder: '#e4edfa', ai: '#ece4f7', code: '#e2f0e6', data: '#dfeeee', end: '#f7ead2', subgraph: '#e7e6f6', start: '#f8efd3' },
  },
  {
    id: 'anthracite',
    label: 'Anthracite — almost black',
    // Darker than Graphit and colder: for a room with the lights off, or a
    // second window beside one that is already dark.
    sunken: '#0a0a0b', surface: '#141416', line: '#28282c',
    raise: 'rgba(255,255,255,0.035)', hover: 'rgba(255,255,255,0.07)',
    scrim: 'rgba(0,0,0,0.78)',
    text: '#ededf0', muted: '#a8a8af', dim: '#97979d', dimmer: '#8c8c91',
    accent: '#8b93ff', accentText: '#b4b9ff', accentFill: 'rgba(139,147,255,0.12)', onAccent: '#111119',
    success: '#4ade80', successText: '#86efac', danger: '#fb7185', dangerText: '#fda4af',
    warning: '#eab308', warningText: '#fcd34d', infoText: '#93c5fd', purpleText: '#c4b5fd',
    nodes: { folder: '#1a2230', ai: '#241f30', code: '#1a2a20', data: '#182a2b', end: '#2c2416', subgraph: '#20203a', start: '#2c2614' },
  },
  {
    id: 'graphite',
    label: 'Graphite — neutral dark',
    sunken: '#111113', surface: '#1b1b1f', line: '#33333a',
    raise: 'rgba(255,255,255,0.04)', hover: 'rgba(255,255,255,0.07)',
    scrim: 'rgba(0,0,0,0.70)',
    text: '#e8e8ea', muted: '#b3b3b9', dim: '#a1a1a5', dimmer: '#96969a',
    accent: '#2dd4bf', accentText: '#5eead4', accentFill: 'rgba(45,212,191,0.12)', onAccent: '#06231f',
    success: '#34d399', successText: '#86efac', danger: '#f87171', dangerText: '#fca5a5',
    warning: '#eab308', warningText: '#fcd34d', infoText: '#93c5fd', purpleText: '#c4b5fd',
    nodes: { folder: '#1d2f36', ai: '#2a2435', code: '#1e3228', data: '#1c3234', end: '#342819', subgraph: '#26263a', start: '#35301b' },
  },
];

/**
 * Colours for telling series apart, one set per kind of page.
 *
 * Not per scheme: what makes eight colours distinguishable is how they sit on a
 * dark or a light ground, and there are only those two grounds. The first of
 * the eight is always the scheme's own accent, so a one-series chart matches
 * the page it is on. A chart -- or SVG that arrives at one -- reaches them as
 * `var(--plot-1)` … `var(--plot-8)`, which is how it keeps working when the
 * scheme is changed.
 */
const PLOT_ON_DARK = ['#22c55e', '#f59e0b', '#ec4899', '#06b6d4', '#a78bfa', '#84cc16', '#fb923c'];
const PLOT_ON_LIGHT = ['#15803d', '#b45309', '#be185d', '#0e7490', '#6d28d9', '#4d7c0f', '#c2410c'];

export function plotColours(id: string | undefined): string[] {
  const s = scheme(id);
  return [s.accent, ...(s.light ? PLOT_ON_LIGHT : PLOT_ON_DARK)];
}

export function scheme(id: string | undefined): Scheme {
  return SCHEMES.find((s) => s.id === id) ?? SCHEMES[0];
}

/**
 * The scheme as CSS variables, for the container of a page: the Page tab's
 * surface, the App tab, a deployed tool's root.
 *
 * Variables rather than props threaded through the tree: a component asks
 * `ui/theme.ts` for SURFACE and needs to know nothing about schemes, which is
 * what lets one switch repaint every block, border and accent of the page
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
    '--ui-info-text': s.infoText,
    '--ui-purple-text': s.purpleText,
    '--ui-node-folder': s.nodes.folder,
    '--ui-node-ai': s.nodes.ai,
    '--ui-node-code': s.nodes.code,
    '--ui-node-data': s.nodes.data,
    '--ui-node-end': s.nodes.end,
    '--ui-node-subgraph': s.nodes.subgraph,
    '--ui-node-start': s.nodes.start,
    ...Object.fromEntries(plotColours(id).map((colour, index) => [`--plot-${index + 1}`, colour])),
    // Scrollbars, form controls and the window's own backdrop follow, so a
    // light scheme is light to the edges instead of a light page on a dark desk.
    colorScheme: s.light ? 'light' : 'dark',
  } as React.CSSProperties;
}
