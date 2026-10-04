// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

// The server's file browser: its own folder, and nothing anywhere else.
vi.mock('../api/client', async (actual) => {
  const real = await actual<typeof import('../api/client')>();
  return {
    ...real,
    call: vi.fn(async (route: string, body: { path: string }) => {
      if (route !== 'browse') throw new Error(`not expected here: ${route}`);
      if (body.path) throw new real.ApiError(404, { detail: `Directory not found: ${body.path}` });
      return { path: '/work', parent: '/', entries: [], roots: ['/'] };
    }),
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { default: FileBrowserDialog } = await import('./FileBrowserDialog');

let root: Root | null = null;

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  document.body.innerHTML = '';
});

/** Settle what the dialog asked the server. */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

/** The dialog in *mode*, with *path* typed into its path box and Go pressed. */
async function wentTo(mode: 'save' | 'file', path: string): Promise<string> {
  const page = document.createElement('div');
  document.body.appendChild(page);
  const shown = createRoot(page);
  root = shown;
  await act(async () => {
    shown.render(createElement(FileBrowserDialog, { mode, defaultName: 'tool', onPick: () => {}, onClose: () => {} }));
  });
  await settle();
  const box = document.querySelector<HTMLInputElement>('[aria-label="Current path"]')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(box, path);
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const go = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Go')!;
  await act(async () => { go.click(); });
  await settle();
  return document.body.textContent ?? '';
}

describe('the file browser, at a folder that is not there', () => {
  it('saving, says Save here makes it -- not "Directory not found" in red', async () => {
    // Rebuilt by hand: the Save dialog showed "Directory not found: …" in red
    // for the folder "Save here" was about to make.
    const said = await wentTo('save', '/work/new_tools');
    expect(said).toContain('This folder is not there yet: Save here makes it.');
    expect(said).not.toContain('Directory not found');
    const saveHere = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Save here')!;
    expect(saveHere.disabled).toBe(false);
  });

  it('opening, says it is not found: there is nothing to open there', async () => {
    expect(await wentTo('file', '/work/missing')).toContain('Directory not found: /work/missing');
  });
});

describe('the file browser, opening', () => {
  it('is drawn first as loading -- not as a folder with nothing in it', () => {
    // Re-test: Open showed "No folders, and no files matching .json." with an empty path box first.
    const first = renderToStaticMarkup(createElement(FileBrowserDialog, { mode: 'file', extensions: '.json', onPick: () => {}, onClose: () => {} }));
    expect(first).toContain('Loading…');
    expect(first).not.toContain('No folders');
  });
});
