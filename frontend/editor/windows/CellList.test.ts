// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { addWindow, blankPage, patchInput } from '../../../gui/editor/windows/edit.ts';
import { inBlock } from '../../../gui/editor/windows/windows.ts';
import CellList, { type Hot } from './CellList';
import { useNotebook } from './notebookStore';

/**
 * The list of a window's cells, used as it is: what a click on a button and a word typed into a box do to
 * the page -- through the store's edits, as the notebook makes them.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const store = () => useNotebook.getState();
let root: Root;
let screen: HTMLElement;
let hotNow: Hot = null;

function List() {
  const doc = useNotebook((s) => s.doc)!;
  const [hot, setHot] = useState<Hot>(null);
  hotNow = hot;
  return createElement(CellList, { doc, window: doc.windows[0], hot, onHot: setHot, onChange: store().edit });
}

beforeEach(async () => {
  store().start(addWindow(blankPage('Tool'), 'Second'));
  screen = document.createElement('div');
  document.body.appendChild(screen);
  root = createRoot(screen);
  await act(async () => { root.render(createElement(List)); });
});

afterEach(async () => {
  await act(async () => { root.unmount(); });
  screen.remove();
});

const button = (text: string): HTMLButtonElement => {
  const found = [...screen.querySelectorAll('button')].find((one) => one.textContent?.trim() === text || one.getAttribute('aria-label') === text);
  if (!found) throw new Error(`no button "${text}"`);
  return found as HTMLButtonElement;
};
const click = async (target: HTMLElement) => { await act(async () => { target.click(); }); };
const field = (label: string, at = 0): HTMLInputElement | HTMLTextAreaElement => screen.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`)[at];
/** Typing: the value as the browser sets it, then the event React listens to. */
async function type(target: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = target instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(target, value);
    target.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const window0 = () => store().doc!.windows[0];

describe('the cells of a window', () => {
  it('adds an input, a step and an output with the buttons under each list, and takes one away', async () => {
    await click(button('+ Number'));
    expect(window0().inputs.map((one) => one.kind)).toEqual(['text', 'number']);
    await click(button('+ Step'));
    await click(button('+ Chart'));
    expect(window0().steps).toHaveLength(2);
    expect(window0().outputs.map((one) => one.kind)).toEqual(['text', 'chart']);
    // The new cell mentions what is before it, so the page is still one that works.
    expect(window0().steps[1].sentence).toBe('Continue with @Result');

    await click(screen.querySelectorAll<HTMLElement>('[aria-label="Remove"]')[1]);
    expect(window0().inputs.map((one) => one.kind)).toEqual(['text']);
  });

  it('writes the sentence of a step, and points at an input with a click -- at the end, where nothing is selected', async () => {
    const sentence = field('Sentence');
    await type(sentence, 'Shout it: ');
    expect(window0().steps[0].sentence).toBe('Shout it: ');
    await click(button('@Text'));
    expect(window0().steps[0].sentence).toBe('Shout it: @Text');
    // What the sentence takes is shown as it stands.
    expect(screen.textContent).toContain('takes:');
  });

  it('renames an input and the sentences that point at it, so a rename breaks nothing -- in the box the person is typing in, which stays the same box', async () => {
    const box = field('Name', 0);
    await type(box, 'Sto');
    await type(box, 'Story');
    expect(field('Name', 0)).toBe(box);
    expect(window0().inputs[0].name).toBe('Story');
    expect(window0().steps[0].sentence).toBe('Say it more simply: @Story');
  });

  it('lights the cell an element belongs to when it is pointed at, and its element when the cell is', async () => {
    const row = screen.querySelector<HTMLElement>(`#cell-${inBlock(window0(), window0().inputs[0])}`)!;
    await act(async () => { row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); row.dispatchEvent(new Event('mouseenter')); });
    expect(hotNow).toBe(inBlock(window0(), window0().inputs[0]));
  });

  it('says so when nothing would start the window, and sizes an output by a click', async () => {
    await click(screen.querySelector<HTMLInputElement>('input[type="checkbox"]')!);
    expect(window0().trigger).toMatchObject({ button: false });
    expect(screen.textContent).toContain('Nothing starts this window yet.');

    await click(button('L'));
    expect(window0().outputs[0].rows).toBe(5);
    await click(button('S'));
    expect(window0().outputs[0].rows).toBe(2);
  });

  it('keeps the width an input was given as a share of the window, and offers choices for a choice', async () => {
    await act(async () => { store().edit((doc) => patchInput(doc, window0().id, 0, { kind: 'choice', options: ['a', 'b'] })); });
    expect(field('Choices').value).toBe('a\nb');
    await click(button('½'));
    expect(window0().inputs[0].width).toBe(0.5);
    await type(field('Choices'), 'a\nb\nc');
    expect(window0().inputs[0].options).toEqual(['a', 'b', 'c']);
  });
});
