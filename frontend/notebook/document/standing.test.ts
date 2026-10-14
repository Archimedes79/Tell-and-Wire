import { describe, expect, it } from 'vitest';
import { standing } from './store';
import { addInput, addWindow, blankPage, patchStep } from '../../../gui/notebook/edit.ts';

describe('what stands of the windows after an edit', () => {
  it('is every window that was written the same: adding a window leaves the others as they ran', () => {
    const one = blankPage('T');
    expect([...standing(one, addWindow(one, 'Two'))]).toEqual(['first_window']);
  });

  it('drops the window that was edited, and the ones that take from it, however far back', () => {
    let doc = addWindow(addWindow(blankPage('T'), 'Two'), 'Three');
    doc = addInput(doc, 'two', 'from');
    doc = addInput(doc, 'three', 'from');
    // `from` points at the first window by default; make the third take from the second.
    doc = { ...doc, windows: doc.windows.map((window) => (window.id === 'three' ? { ...window, inputs: window.inputs.map((input) => (input.kind === 'from' ? { ...input, from: { window: 'two', output: doc.windows[1].outputs[0].name } } : input)) } : window)) };
    const edited = patchStep(doc, 'first_window', 0, { sentence: 'Something else entirely.' });
    expect([...standing(doc, edited)].sort()).toEqual([]);
    const lastOnly = patchStep(doc, 'three', 0, { sentence: 'Another sentence for the last.' });
    expect([...standing(doc, lastOnly)].sort()).toEqual(['first_window', 'two']);
  });
});
