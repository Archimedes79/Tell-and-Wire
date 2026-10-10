// How a block sits on the page, chosen from a closed set rather than picked
// from a colour wheel.
//
// A colour picker is how interfaces get ugly: every value is available, most
// combinations are wrong, and the person choosing is not a designer. Four roles
// drawn from the one palette cannot be combined badly — the same reason LaTeX
// gives you `\section` and not a font size.
//
// Named by role, not by appearance, so the names stay true when the palette
// changes (see ui/theme.ts, which is built on the same rule).
import type { CSSProperties } from 'react';
import { ACCENT, ACCENT_FILL, LINE, RAISE, SUNKEN } from './theme';

export type Tone = 'plain' | 'raised' | 'sunken' | 'accent';

/** What lifts a block off the page: a light edge along the top, which a shadow alone cannot give on a dark page, and a close shadow and a soft one. */
const LIFT = 'inset 0 1px 0 color-mix(in srgb, white 7%, transparent), 0 1px 2px color-mix(in srgb, black 22%, transparent), 0 6px 16px -6px color-mix(in srgb, black 28%, transparent)';

export const TONES: Tone[] = ['plain', 'raised', 'sunken', 'accent'];

export const TONE_LABELS: Record<Tone, string> = {
  plain: 'Plain — no box (headings, prose)',
  raised: 'Raised — lifts off the page (windows, plots)',
  sunken: 'Sunken — recessed (input fields)',
  accent: 'Accent — tinted (the one thing to notice)',
};

/** What a person may set on top of the tone: a frame, and a colour of their own. */
interface Look {
  border?: boolean;
  background?: string;
}

/**
 * The block's own chrome.
 *
 * `plain` is the important one: it is what turns a heading into a heading
 * instead of a labelled box, and it is why the runtime window stopped looking
 * like an inspector. Every widget used to get the same border and background
 * unconditionally, plus a truncated dump of its own output underneath.
 *
 * The tone is the default; a `Look` overrides one thing at a time. A frame on
 * a plain block, or no frame on a raised one, is a choice about that block and
 * changes nothing else -- and a colour picked by hand is exactly that, the
 * person's own, not a fifth tone.
 */
export function toneStyle(tone: Tone | undefined, look: Look = {}): CSSProperties {
  const base = ((): CSSProperties => {
    switch (tone) {
      case 'plain':
        return { background: 'transparent', border: '1px solid transparent' };
      case 'sunken':
        return { background: SUNKEN, border: `1px solid ${LINE}` };
      case 'accent':
        return { background: ACCENT_FILL, border: `1px solid ${ACCENT}`, boxShadow: LIFT };
      case 'raised':
      default:
        return { background: RAISE, border: `1px solid ${LINE}`, boxShadow: LIFT };
    }
  })();
  if (look.border === true) base.border = `1px solid ${tone === 'accent' ? ACCENT : LINE}`;
  if (look.border === false) { base.border = '1px solid transparent'; base.boxShadow = undefined; }
  if (look.background) base.background = look.background;
  return base;
}

/** Does the block draw a box at all? */
export function toneIsBare(tone: Tone | undefined, look: Look = {}): boolean {
  if (look.border !== undefined) return !look.border && !look.background;
  return tone === 'plain' && !look.background;
}
