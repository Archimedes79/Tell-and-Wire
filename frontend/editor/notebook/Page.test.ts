// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { addBlock, pageOf, startPage } from '../../../gui/editor/windows/page.ts';
import Page, { spanAt } from './Page';
import { useNotebook } from './store';

/**
 * The page used as it is: typed into, with Enter, Backspace and the first characters of a line, in blocks, as Markdown, and
 * read as the tool it is -- what a key does to the document, through the store's edits.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const store = () => useNotebook.getState();
let root: Root;
let screen: HTMLElement;

function Host({ writing }: { writing: boolean }) {
  const doc = useNotebook((s) => s.doc)!;
  return createElement(Page, { doc, writing });
}

async function mount(writing = true) {
  await act(async () => { root.render(createElement(Host, { writing })); });
}

beforeEach(async () => {
  store().start(startPage('Tool'));
  screen = document.createElement('div');
  document.body.appendChild(screen);
  root = createRoot(screen);
  await mount();
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  screen.remove();
});

const boxes = () => [...screen.querySelectorAll<HTMLTextAreaElement>('textarea.nb-text')];
const kinds = () => pageOf(store().doc!).map((block) => block.kind);
/** Typing: the value as the browser sets it, then the event React listens to. */
async function type(box: HTMLTextAreaElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(box, value);
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function press(box: HTMLTextAreaElement, key: string, caret?: number) {
  await act(async () => {
    box.focus();
    const at = caret ?? box.value.length;
    box.setSelectionRange(at, at);
    box.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
}

describe('the page, written', () => {
  it('starts the next block with Enter and puts the cursor in it', async () => {
    await press(boxes()[0], 'Enter');
    expect(kinds()).toEqual(['h1', 'p', 'window']);
    expect(document.activeElement).toBe(boxes()[1]);
  });

  it('turns a line into a heading or a list by how it begins, as Markdown does', async () => {
    await press(boxes()[0], 'Enter');
    await type(boxes()[1], '## What it does');
    expect(pageOf(store().doc!)[1]).toMatchObject({ kind: 'h2', text: 'What it does' });
    await press(boxes()[1], 'Enter');
    await type(boxes()[2], '- reads');
    expect(pageOf(store().doc!)[2]).toMatchObject({ kind: 'ul', text: 'reads' });
  });

  it('ends a list with Enter on an empty item, and takes an empty block away with Backspace', async () => {
    await press(boxes()[0], 'Enter');
    await type(boxes()[1], '- one');
    // Enter in a list is the browser's own newline, until the item is empty.
    await act(async () => { store().edit((doc) => ({ ...doc, page: pageOf(doc).map((block) => (block.kind === 'ul' ? { ...block, text: 'one\n' } : block)) })); });
    await press(boxes()[1], 'Enter');
    expect(kinds()).toEqual(['h1', 'ul', 'p', 'window']);
    expect(pageOf(store().doc!)[1].text).toBe('one');
    await press(boxes()[2], 'Backspace');
    expect(kinds()).toEqual(['h1', 'ul', 'window']);
    expect(document.activeElement).toBe(boxes()[1]);
  });

  it('puts a block in with the plus between blocks, and a window with its first cell', async () => {
    const plus = screen.querySelector<HTMLElement>('.nb-add.below button.plus')!;
    await act(async () => { plus.click(); });
    const item = [...screen.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((one) => one.textContent === 'Bullets')!;
    await act(async () => { item.click(); });
    expect(kinds()).toEqual(['h1', 'ul', 'window']);
    await act(async () => { store().edit((doc) => addBlock(doc, 'window')); });
    expect(store().doc!.windows).toHaveLength(2);
  });

  it('is Markdown to type, and the typing is the page when the box is left', async () => {
    await act(async () => { store().show({ source: true }); });
    const box = screen.querySelector<HTMLTextAreaElement>('textarea.nb-source')!;
    expect(box.value).toContain('# Tool');
    await type(box, `# Changed\n\nHello.\n\n[window: ${store().doc!.windows[0].id}]\n`);
    await act(async () => { box.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); box.blur(); });
    await act(async () => { box.dispatchEvent(new Event('blur')); });
    expect(pageOf(store().doc!).map((block) => block.text ?? block.kind)).toEqual(['Changed', 'Hello.', 'window']);
  });
});

describe('the page, read', () => {
  it('is the page as people use it: the words as words, the window to use, nothing to type into but the window', async () => {
    await mount(false);
    expect(screen.querySelector('h1')?.textContent).toBe('Tool');
    expect(screen.querySelectorAll('textarea.nb-text')).toHaveLength(0);
    expect(screen.querySelector('.nb-win')).not.toBeNull();
    // Every part stands in the flow as the stylesheet knows it, written and read alike: a heading across the page, a window in its share.
    expect(screen.querySelectorAll('.nb-flow > .nb-block')).toHaveLength(pageOf(store().doc!).length);
    expect(screen.querySelectorAll('.nb-flow > .nb-block.win')).toHaveLength(1);
    expect(screen.querySelector('.nb-tools')).toBeNull();
    expect([...screen.querySelectorAll('button')].some((one) => one.textContent === 'Cells')).toBe(false);
  });
});

describe('the options of a block and the width of a window', () => {
  it('keeps the options behind a handle in the margin, and opens them only when it is pressed', async () => {
    expect(screen.querySelector('.nb-tools')).toBeNull();
    const handle = screen.querySelector<HTMLElement>('.nb-grip .handle')!;
    await act(async () => { handle.click(); });
    expect(screen.querySelector('.nb-tools')).not.toBeNull();
    const down = [...screen.querySelectorAll<HTMLElement>('.nb-tools button')].find((one) => one.getAttribute('aria-label') === 'Move down')!;
    await act(async () => { down.click(); });
    expect(kinds()).toEqual(['window', 'h1']);
    expect(screen.querySelector('.nb-tools')).toBeNull();
  });

  it('takes a window to a quarter, a half, three quarters or the full line, by a pull or the arrow keys', async () => {
    const key = (key: string) => act(async () => { screen.querySelector<HTMLElement>('.nb-edge')!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); });
    expect(store().doc!.windows[0].span).toBe(8);
    await key('ArrowRight');
    expect(store().doc!.windows[0].span).toBe(12);
    await key('ArrowRight'); await key('ArrowRight');
    expect(store().doc!.windows[0].span).toBe(16);
    await key('ArrowLeft'); await key('ArrowLeft'); await key('ArrowLeft'); await key('ArrowLeft'); await key('ArrowLeft');
    expect(store().doc!.windows[0].span).toBe(4);
    expect(spanAt(500, 100, 800)).toBe(8);
    expect(spanAt(60, 100, 800)).toBe(4);
    expect(spanAt(2000, 100, 800)).toBe(16);
  });
});
