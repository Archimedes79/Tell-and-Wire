import { describe, it, expect } from 'vitest';
import {
  addInput, addOutput, addStep, addWindow, blankPage, freshName, kindOfOutput, moveCell, removeCell, removeWindow, renameInput, renameStep, repoint,
} from '../../../gui/editor/windows/edit.ts';
import { windowProblems, windowsToGraph, type Windows } from '../../../gui/editor/windows/windows.ts';
import { problemsIn } from '../../../gui/editor/check.ts';

/**
 * The edits of the notebook's buttons: each returns a new document, and the document is still one that
 * becomes a graph that works -- the buttons cannot be used to make a window that does not.
 */

const page = (): Windows => {
  const first = addWindow({ name: 'Texts', description: '', windows: [] }, 'Summarize');
  return first;
};

describe('editing windows', () => {
  it('starts a page with a window that already works', () => {
    const doc = blankPage('Tool');
    expect(doc.windows).toHaveLength(1);
    expect(windowProblems(doc)).toEqual([]);
    expect(problemsIn(windowsToGraph(doc))).toEqual([]);
  });

  it('adds inputs, cells and outputs under names that do not collide, and every edit leaves its argument alone', () => {
    const doc = page();
    const before = JSON.stringify(doc);
    const id = doc.windows[0].id;
    let next = addInput(doc, id, 'text');
    next = addInput(next, id, 'text');
    next = addStep(next, id);
    next = addStep(next, id);
    next = addOutput(next, id, 'chart');
    next = addOutput(next, id, 'chart');
    expect(JSON.stringify(doc)).toBe(before);
    const window = next.windows[0];
    expect(window.inputs.map((one) => one.name)).toEqual(['Text', 'Text 2', 'Text 3']);
    expect(new Set(window.outputs.map((one) => one.name)).size).toBe(3);
    // Nothing of what the buttons made is a problem: a new cell mentions what is before it.
    expect(windowProblems(next)).toEqual([]);
    expect(problemsIn(windowsToGraph(next))).toEqual([]);
  });

  it('renames an input and the sentences that point at it, and not a longer name that starts alike', () => {
    expect(repoint('Summarize @Text and @Text2 in @Text.path', 'Text', 'The text')).toBe('Summarize @The_text and @Text2 in @The_text.path');
    const doc = renameInput(page(), 'summarize', 0, 'Story text');
    expect(doc.windows[0].steps[0].sentence).toBe('Say it more simply: @Story_text');
    expect(windowProblems(doc)).toEqual([]);
  });

  it('renames a cell and what points at it: the later sentences and the output that shows it', () => {
    let doc = addStep(page(), 'summarize');
    doc = renameStep(doc, 'summarize', 0, 'Simple');
    expect(doc.windows[0].steps[1].sentence).toBe('Continue with @Simple');
    expect(doc.windows[0].outputs[0].of).toBe('Simple');
    expect(windowProblems(doc)).toEqual([]);
  });

  it('moves and removes cells, and a window that other windows take from takes its leaving with them', () => {
    let doc = addStep(page(), 'summarize');
    const [a, b] = doc.windows[0].steps.map((step) => step.name);
    doc = moveCell(doc, 'summarize', { list: 'steps', at: 1 }, -1);
    expect(doc.windows[0].steps.map((step) => step.name)).toEqual([b, a]);
    expect(moveCell(doc, 'summarize', { list: 'steps', at: 0 }, -1)).toEqual(doc);
    doc = removeCell(doc, 'summarize', { list: 'steps', at: 0 });
    expect(doc.windows[0].steps).toHaveLength(1);

    let two = addWindow(page(), 'English');
    two = addInput(two, 'english', 'from');
    expect(two.windows[1].inputs.at(-1)!.from).toEqual({ window: 'summarize', output: 'Result' });
    expect(removeWindow(two, 'summarize').windows[0].inputs.some((one) => one.kind === 'from')).toBe(false);
  });

  it('gives an output of another kind the height of that kind, and names windows apart', () => {
    const doc = kindOfOutput(page(), 'summarize', 0, 'chart');
    expect(doc.windows[0].outputs[0]).toMatchObject({ kind: 'chart', rows: 5 });
    expect(addWindow(addWindow(page(), 'Summarize'), 'Summarize').windows.map((window) => window.id)).toEqual(['summarize', 'summarize_2', 'summarize_3']);
    expect(freshName('Result', ['result'])).toBe('Result 2');
  });
});
