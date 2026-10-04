import { describe, expect, it } from 'vitest';
import { SCHEMES } from './scheme';

type Rgb = [number, number, number];

/** A colour as it is written in `scheme.ts` -- #rrggbb or rgba() -- laid over *under* when it is translucent. */
function paint(color: string, under: Rgb = [0, 0, 0]): Rgb {
  if (color.startsWith('#')) {
    const n = parseInt(color.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const [r, g, b, a = 1] = color.match(/[\d.]+/g)!.map(Number);
  return [r, g, b].map((v, i) => v * a + under[i] * (1 - a)) as Rgb;
}

/** The tint behind a message: *color* at a tenth over *under*, as `theme.ts` draws it. */
const tint = (color: string, under: Rgb): Rgb => paint(color, under).map((v, i) => v * 0.1 + under[i] * 0.9) as Rgb;

function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio. */
function contrast(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe('colour schemes', () => {
  it('every text colour reads at 4.5:1 on what it is drawn on, in every scheme', () => {
    const failures: string[] = [];
    for (const s of SCHEMES) {
      const sunken = paint(s.sunken);
      const surface = paint(s.surface);
      const grounds: Record<string, Rgb> = {
        page: sunken, panel: surface, raised: paint(s.raise, sunken), hovered: paint(s.hover, surface), accent: paint(s.accentFill, surface),
      };
      const check = (what: string, text: string, ground: Rgb) => {
        const ratio = contrast(paint(text, ground), ground);
        if (ratio < 4.5) failures.push(`${s.id}: ${what} ${ratio.toFixed(2)}`);
      };
      for (const [ground, rgb] of Object.entries(grounds)) {
        for (const name of ['text', 'muted', 'dim', 'dimmer', 'accentText', 'dangerText', 'successText', 'warningText', 'infoText', 'purpleText'] as const) {
          check(`${name} on ${ground}`, s[name], rgb);
        }
      }
      check('dangerText on its tint', s.dangerText, tint(s.danger, surface));
      check('successText on its tint', s.successText, tint(s.success, surface));
      check('warningText on its tint', s.warningText, tint(s.warning, surface));
      check('a button label on the accent', s.onAccent, paint(s.accent));
    }
    expect(failures).toEqual([]);
  });
});
