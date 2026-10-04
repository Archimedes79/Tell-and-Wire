/**
 * The editor's colour vocabulary, and the few style objects built from it.
 *
 * One place, so the chrome stays in step and "make the panels a shade
 * lighter" is answered here, not in a hundred literals across the editor.
 *
 * Named by role, not by appearance, so the names stay true if the palette
 * changes. A colour used once, as data (a chart series, a colour input's
 * default), stays where it is used -- this file is for the colours that repeat.
 */

/**
 * Every colour is a `var()` into a colour scheme (ui/scheme.ts). The page's
 * container sets the variables (the Page tab's surface, the App tab, a deployed
 * tool), so the blocks on it are in its scheme; the editor's own chrome sets
 * none, and so keeps the literal after the comma -- the Night scheme -- under
 * every scheme. Keep those literals equal to Night's values.
 *
 * That indirection is the whole mechanism: a component asks for SURFACE and
 * knows nothing of schemes, and switching scheme repaints the page without one
 * call site changing.
 *
 * CSS variables resolve in style *properties* only, never in SVG presentation
 * attributes -- an SVG shape must take these through `style`, not `fill=`.
 */

/** Recessed surfaces: page background, inputs, code areas, dialog headers. */
export const SUNKEN = 'var(--ui-sunken, #0f1117)';
/** Raised surfaces: panels, modals, nodes, floating windows. */
export const SURFACE = 'var(--ui-surface, #1a1d2e)';
/** Borders — and the neutral button fill, which is the same colour by design. */
export const LINE = 'var(--ui-line, #2d3148)';
/** The barely-there lift of a block off the page. */
export const RAISE = 'var(--ui-raise, rgba(255,255,255,0.03))';
/** A row or button under the pointer. */
export const HOVER = 'var(--ui-hover, rgba(255,255,255,0.06))';
/** Behind a modal. */
export const SCRIM = 'var(--ui-scrim, rgba(0,0,0,0.70))';

export const TEXT = 'var(--ui-text, #e2e8f0)';
/** Labels and secondary text. */
export const MUTED = 'var(--ui-muted, #a5b2c3)';
/** Help text under a control. */
export const DIM = 'var(--ui-dim, #96a0b0)';
/** Hints and disabled-ish detail; the faintest readable step. */
export const DIMMER = 'var(--ui-dimmer, #8c95a1)';

export const ACCENT = 'var(--ui-accent, #6164ec)';
/** Accent-coloured text on a normal surface. */
export const ACCENT_TEXT = 'var(--ui-accent-text, #a5b4fc)';
/** The accent at low opacity: tinted notes, the `accent` tone's fill. */
export const ACCENT_FILL = 'var(--ui-accent-fill, rgba(99,102,241,0.10))';
/** Text on top of the accent itself — a button's label. */
export const ON_ACCENT = 'var(--ui-on-accent, #ffffff)';
/**
 * The accent as a soft glow around what is selected: mixed from the scheme's
 * own accent, so it is that accent's glow in every scheme.
 */
export const ACCENT_GLOW = `color-mix(in srgb, ${ACCENT} 30%, transparent)`;

/**
 * An event: the ◆ a run begins at, and a wire into one. Amber whatever the
 * scheme -- it is the one colour that says "a run starts here", on the canvas
 * and on the page alike.
 */
export const EVENT = 'var(--ui-event, #f59e0b)';

export const SUCCESS = 'var(--ui-success, #22c55e)';
/** Success as text (was `#86efac`). */
export const SUCCESS_TEXT = 'var(--ui-success-text, #86efac)';
export const DANGER = 'var(--ui-danger, #ef4444)';
/** Error text, readable on this scheme's own background. */
export const DANGER_TEXT = 'var(--ui-danger-text, #fca5a5)';
/** Something to look at, not an error: warning fills and borders. */
export const WARNING = 'var(--ui-warning, #eab308)';
/** Warning text (was `#fcd34d`). */
export const WARNING_TEXT = 'var(--ui-warning-text, #fcd34d)';
/** A note that is neither good nor bad. */
export const INFO_TEXT = 'var(--ui-info-text, #93c5fd)';
/** The one emphasis that is not the accent: a name picked out in a sentence (was `#a78bfa`). */
export const PURPLE_TEXT = 'var(--ui-purple-text, #c4b5fd)';
/** The tint behind a message of that meaning: the colour at a tenth, in every scheme. */
export const SUCCESS_FILL = `color-mix(in srgb, ${SUCCESS} 10%, transparent)`;
export const DANGER_FILL = `color-mix(in srgb, ${DANGER} 10%, transparent)`;
export const WARNING_FILL = `color-mix(in srgb, ${WARNING} 10%, transparent)`;
/** Destructive affordance inside an otherwise neutral control. */
export const DANGER_SOFT = 'var(--ui-danger, #f87171)';

/**
 * One tint per kind of node, so the canvas reads at a glance: the pill on its
 * card, its swatch in the palette, the tag of a block's panel. The editor is
 * always Night, so these are the literals; keep them equal to Night's `nodes`.
 */
export const NODE = {
  folder: 'var(--ui-node-folder, #1e3a5f)',
  ai: 'var(--ui-node-ai, #2d1b4e)',
  code: 'var(--ui-node-code, #1a3a2a)',
  data: 'var(--ui-node-data, #183b3b)',
  end: 'var(--ui-node-end, #3a2000)',
  subgraph: 'var(--ui-node-subgraph, #2a2a4a)',
  start: 'var(--ui-node-start, #4a3a12)',
} as const;

/** A form control on a panel. The single most copied style object in the app. */
export const FIELD = { background: SUNKEN, color: TEXT, border: `1px solid ${LINE}` } as const;

/** A form control on an already-sunken surface (the widget list's inner cards). */
export const FIELD_ON_SURFACE = { background: SURFACE, color: TEXT, border: `1px solid ${LINE}` } as const;

/** A raised container: modal panel, floating window, widget card. */
export const PANEL = { background: SURFACE, border: `1px solid ${LINE}` } as const;

/** A recessed container: dialog header bars, inner wells. */
export const WELL = { background: SUNKEN, border: `1px solid ${LINE}` } as const;
