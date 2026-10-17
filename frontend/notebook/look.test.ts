import { describe, expect, it } from 'vitest';
import { parseLook } from './look';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SCHEMES, schemeVariables } from '../../gui/windows/scheme.ts';

/** The notebook's stylesheet as written: Vite hands a stylesheet imported in a test over as nothing. */
const css = readFileSync(fileURLToPath(new URL('./notebook.css', import.meta.url)), 'utf8');

describe('the look of the notebook', () => {
  it('is dark only where it was kept dark: whatever else is stored, or nothing, is the white default', () => {
    expect(parseLook('dark')).toBe('dark');
    for (const other of ['light', 'Dark', '', null, undefined, 3]) expect(parseLook(other)).toBe('light');
  });

  it('paints its page in the tool\'s scheme, and asks it only for what every scheme makes', () => {
    const made = Object.keys(schemeVariables('white')).sort();
    for (const { id } of SCHEMES) expect(Object.keys(schemeVariables(id)).sort()).toEqual(made);
    const asked = [...new Set([...css.matchAll(/var\((--(?:ui|plot)-[a-z0-9-]+)/g)].map((match) => match[1]))];
    expect(asked.length).toBeGreaterThan(10);
    expect(asked.filter((name) => !made.includes(name))).toEqual([]);
  });
});
