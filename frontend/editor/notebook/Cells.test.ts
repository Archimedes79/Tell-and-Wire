// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { startPage } from '../../../gui/editor/windows/page.ts';
import { inBlock } from '../../../gui/editor/windows/windows.ts';
import Cells from './Cells';
import { useNotebook } from './store';

/**
 * The list of a window's cells, used as it is: what a click on a button and a word typed into a box do to the page -- through
 * the store's edits, as the notebook makes them.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const store = () => useNotebook.getState();
let root: Root;
let screen: HTMLElement;

function Host() {
  const doc = useNotebook((s) => s.doc)!;
  return createElement(Cells, { doc, window: doc.windows[0] });
}

beforeEach(async () => {
  store().start(startPage('Tool'));
  screen = document.createElement('div');
  document.body.appendChild(screen);
  root = createRoot(screen);
  await act(async () => { root.render(createElement(Host)); });
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  screen.remove();
});

const button = (text: string, at = 0): HTMLButtonElement => {
  const found = [...screen.querySelectorAll('button')].filter((one) => one.textContent?.trim() === text || one.getAttribute('aria-label') === text)[at];
  if (!found) throw new Error(`no button "${text}"`);
  return found as HTMLButtonElement;
};
const click = async (target: HTMLElement) => { await act(async () => { target.click(); }); };
const field = (label: string, at = 0) => screen.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[aria-label="${label}"]`)[at];
async function type(target: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : target instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(target, value);
    target.dispatchEvent(new Event(target instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}
const window0 = () => store().doc!.windows[0];

describe('the cells of a window', () => {
  it('has a card each for what is asked, what is done and what is shown, as the list of the design does', () => {
    expect(screen.querySelector('[aria-label="Ask"]')).not.toBeNull();
    expect(screen.querySelector('[aria-label^="Do:"]')).not.toBeNull();
    expect(screen.querySelector('[aria-label^="Show:"]')).not.toBeNull();
    expect(screen.textContent).toContain('takes:');
    expect(screen.textContent).toContain('gives:');
  });

  it('adds a field, a step and an output with the buttons, and takes one away', async () => {
    await click(button('+ Number'));
    await click(button('+ Do'));
    await click(button('+ Show'));
    expect(window0().inputs.map((one) => one.kind)).toEqual(['text', 'number']);
    expect(window0().steps).toHaveLength(2);
    expect(window0().outputs).toHaveLength(2);
    // The new step takes what is before it, so the window is still one that works.
    expect(window0().steps[1].sentence).toBe('Continue with @Result');
    await click(button('Remove', 1));
    expect(window0().inputs).toHaveLength(1);
  });

  it('points at an input with a click, and writes into the sentence as it is typed', async () => {
    await type(field('What should be done'), 'Shout it: ');
    expect(window0().steps[0].sentence).toBe('Shout it: ');
    await click(button('@Text'));
    expect(window0().steps[0].sentence).toBe('Shout it: @Text');
    expect(screen.textContent).toContain('takes:');
  });

  it('renames a field and the sentences that point at it, in the box that stays the same box', async () => {
    const box = field('Name', 0);
    await type(box, 'Sto');
    await type(box, 'Story');
    expect(field('Name', 0)).toBe(box);
    expect(window0().inputs[0].name).toBe('Story');
    expect(window0().steps[0].sentence).toBe('Say it more simply: @Story');
  });

  it('gives a step to code, with code that runs as it stands, to be written in the card', async () => {
    expect(screen.querySelector('textarea.nb-pre')).toBeNull();
    await click(button('Code'));
    expect(window0().steps[0].how).toBe('code');
    const code = field('Code') as HTMLTextAreaElement;
    expect(code.value).toContain('function run(inputs)');
    await type(code, 'function run(inputs) { return { result: 1 }; }');
    expect(window0().steps[0].code).toBe('function run(inputs) { return { result: 1 }; }');
  });

  it('lights the card of an element when it is pointed at, and says so when nothing would start the window', async () => {
    const key = inBlock(window0(), window0().inputs[0]);
    await act(async () => { screen.querySelector<HTMLElement>(`#cell-${key}`)!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); screen.querySelector<HTMLElement>(`#cell-${key}`)!.dispatchEvent(new Event('mouseenter')); });
    expect(store().hot).toBe(key);
    await click(screen.querySelector<HTMLInputElement>('input[type="checkbox"]')!);
    expect(window0().trigger).toMatchObject({ button: false });
    expect(screen.textContent).toContain('Nothing starts this window yet.');
  });

  it('sizes an output by a click, and gives it another kind with the height of that kind', async () => {
    await click(button('L'));
    expect(window0().outputs[0].rows).toBe(5);
    await type(field('Kind', 1), 'chart');
    expect(window0().outputs[0]).toMatchObject({ kind: 'chart', rows: 5 });
  });
});
