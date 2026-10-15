import { afterEach, describe, expect, it, vi } from 'vitest';
import { projectAsked, switchTab } from './notebookLink';

describe('the project a link names', () => {
  it('is read from the address, and none where it names none', () => {
    expect(projectAsked('?open=%2Fwork%2FMy%20tools%2Fa%26b%20%231')).toBe('/work/My tools/a&b #1');
    expect(projectAsked('')).toBeNull();
    expect(projectAsked('?open=%20')).toBeNull();
    expect(projectAsked('?x=1')).toBeNull();
  });
});

describe('the switch to the other product', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('opens the tab first and sends it where the server says', async () => {
    const tab = { opener: {}, location: { href: '' }, close: vi.fn() };
    const open = vi.fn(() => tab);
    vi.stubGlobal('window', { open });
    await switchTab(async () => 'http://127.0.0.1:8003/?open=x');
    expect(open).toHaveBeenCalledWith('', '_blank');
    expect(tab.location.href).toBe('http://127.0.0.1:8003/?open=x');
    expect(tab.opener).toBeNull();
    expect(tab.close).not.toHaveBeenCalled();
  });

  it('closes the tab again and throws what went wrong', async () => {
    const tab = { opener: {}, location: { href: '' }, close: vi.fn() };
    vi.stubGlobal('window', { open: () => tab });
    await expect(switchTab(async () => { throw new Error('This install has no editor.'); })).rejects.toThrow('no editor');
    expect(tab.close).toHaveBeenCalled();
    expect(tab.location.href).toBe('');
  });
});
