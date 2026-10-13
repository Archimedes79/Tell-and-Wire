import { describe, expect, it } from 'vitest';
import { DEFAULT_SCHEME, SCHEMES, scheme } from './scheme';
import { defaultMetadata } from '../../../../../graph/graph.ts';

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
        gui: sunken, panel: surface, raised: paint(s.raise, sunken), hovered: paint(s.hover, surface), accent: paint(s.accentFill, surface),
      };
      const check = (what: string, text: string, ground: Rgb) => {
        const ratio = contrast(paint(text, ground), ground);
        if (ratio < 4.5) failures.push(`${s.id}: ${what} ${ratio.toFixed(2)}`);
      };
      for (const [ground, rgb] of Object.entries(grounds)) {
        for (const name of ['text', 'muted', 'dim', 'dimmer', 'accentText', 'dangerText', 'successText', 'warningText', 'purpleText'] as const) {
          check(`${name} on ${ground}`, s[name], rgb);
        }
      }
      // The neutral button is the colour of the lines: its label, and the signals a button can carry.
      for (const name of ['text', 'muted', 'accentText', 'dangerText', 'successText', 'warningText'] as const) {
        check(`${name} on a neutral button`, s[name], paint(s.line));
      }
      check('dangerText on its tint', s.dangerText, tint(s.danger, surface));
      check('successText on its tint', s.successText, tint(s.success, surface));
      check('warningText on its tint', s.warningText, tint(s.warning, surface));
      check('a button label on the accent', s.onAccent, paint(s.accent));
      check('a button label on the colour of the AI', s.onAi, paint(s.ai));
    }
    expect(failures).toEqual([]);
  });

  it('the marks of a node and of an event read at 3:1 on the ground of the canvas and the panels, and an event as text at 4.5:1', () => {
    const failures: string[] = [];
    for (const s of SCHEMES) {
      for (const [ground, rgb] of [['canvas', paint(s.sunken)], ['panel', paint(s.surface)]] as const) {
        for (const [kind, ink] of Object.entries(s.ink)) {
          const ratio = contrast(paint(ink), rgb);
          if (ratio < 3) failures.push(`${s.id}: the ${kind} ink on the ${ground} ${ratio.toFixed(2)}`);
        }
        const text = contrast(paint(s.event), rgb);
        if (text < 4.5) failures.push(`${s.id}: the event colour as text on the ${ground} ${text.toFixed(2)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('the mark in a round badge reads at 4.5:1 on the success, danger and warning fills, in every scheme', () => {
    const failures: string[] = [];
    for (const s of SCHEMES) {
      for (const fill of ['success', 'danger', 'warning'] as const) {
        const ratio = contrast(paint(s.onSignal), paint(s[fill]));
        if (ratio < 4.5) failures.push(`${s.id}: on ${fill} ${ratio.toFixed(2)}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('are told apart: no two of them have the same ground', () => {
    const grounds = SCHEMES.map((s) => [s.sunken, s.surface].join('/'));
    expect(new Set(grounds).size).toBe(SCHEMES.length);
    expect(SCHEMES.map((s) => s.id)).toEqual(['night', 'paper', 'white', 'modern', 'graphite']);
  });

  it('keep Modern White as designed: the values of docs/modern-white.md, so a change to them is meant', () => {
    expect(scheme('modern')).toMatchObject({
      sunken: '#f3f4f6', surface: '#ffffff', line: '#dde0e5',
      text: '#16181d', muted: '#4f5562', dim: '#5b616e', dimmer: '#636a76',
      accent: '#16181d', accentText: '#16181d', accentFill: 'rgba(22,24,29,0.06)', onAccent: '#ffffff',
      ai: '#c2410c', onAi: '#ffffff', plot: '#2448a6',
      success: '#1f7a4d', danger: '#b42323', warning: '#b45309', event: '#b45309',
      ink: { ai: '#6d28d9', code: '#0f766e', data: '#be185d', end: '#b45309', subgraph: '#475569', start: '#b45309' },
    });
  });

  it('start in Modern White: a tool that names none, and the default of the format, agree', () => {
    expect(DEFAULT_SCHEME).toBe('modern');
    expect(scheme(undefined).id).toBe(DEFAULT_SCHEME);
    expect(scheme('no-such-scheme').id).toBe(DEFAULT_SCHEME);
    expect(defaultMetadata().gui_scheme).toBe(DEFAULT_SCHEME);
  });
});
