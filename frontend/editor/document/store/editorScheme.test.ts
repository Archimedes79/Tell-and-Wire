import { describe, expect, it } from 'vitest';
import { SCHEMES } from '../../../deployment/gui/kit/ui/scheme';
import { paintEditor, resolvedScheme } from './editorScheme';

describe('the colour scheme of the editor', () => {
  it('is the scheme chosen, and with auto the system one: Night in the dark, White in the light', () => {
    expect(resolvedScheme('paper', true)).toBe('paper');
    expect(resolvedScheme('auto', false)).toBe('night');
    expect(resolvedScheme('auto', true)).toBe('white');
  });

  it('is painted on the root of the page: the variables of the scheme, and its colour scheme for native controls', () => {
    for (const s of SCHEMES) {
      const set: Record<string, string> = {};
      const root = { style: { setProperty: (name: string, value: string) => { set[name] = value; }, colorScheme: '' } };
      paintEditor(s.id, root);
      expect(set['--ui-surface'], s.id).toBe(s.surface);
      expect(set['--ui-ink-ai'], s.id).toBe(s.ink.ai);
      expect(set['--plot-1'], s.id).toBe(s.accent);
      expect(root.style.colorScheme, s.id).toBe(s.light ? 'light' : 'dark');
    }
  });
});
