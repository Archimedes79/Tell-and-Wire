// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_LOOK, applyLook, savedLook, useLook } from './look';

describe('the look of the editor', () => {
  beforeEach(() => { window.localStorage.clear(); document.documentElement.removeAttribute('style'); });

  it('is white until it is chosen otherwise, and a name that is no scheme is the same as none', () => {
    expect(DEFAULT_LOOK).toBe('office');
    expect(savedLook()).toBe('office');
    window.localStorage.setItem('tell-and-wire-editor-look', 'nonsense');
    expect(savedLook()).toBe('office');
  });

  it('puts the scheme on the page itself, and keeps what was chosen', () => {
    applyLook('office');
    expect(document.documentElement.style.getPropertyValue('--ui-surface')).toBe('#ffffff');
    expect(document.documentElement.style.colorScheme).toBe('light');
    useLook.getState().choose('night');
    expect(document.documentElement.style.getPropertyValue('--ui-surface')).toBe('#1a1d2e');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(savedLook()).toBe('night');
    expect(useLook.getState().id).toBe('night');
  });
});
