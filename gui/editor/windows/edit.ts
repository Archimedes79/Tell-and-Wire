// Changing windows: the small edits a person makes to a page, each one a function from windows to windows.
//
// Pure, so the editor's buttons are a line each and what they do is tested without a page. Nothing here
// changes its argument: an edit returns the document it made, which is what makes undo a list of them.

import { idOf, type InKind, type OutKind, type Step, type Window, type WindowIn, type WindowOut, type Windows, SIZES } from './windows.ts';

/** A name that is not in *taken*: *base*, else *base 2*, *base 3* ... (ids are made of names, so alike means the same). */
export function freshName(base: string, taken: readonly string[]): string {
  const used = new Set(taken.map(idOf));
  if (!used.has(idOf(base))) return base;
  for (let n = 2; ; n += 1) if (!used.has(idOf(`${base} ${n}`))) return `${base} ${n}`;
}

/** Every name a sentence can point at in *window*: inputs and results. */
export function namesIn(window: Window): string[] {
  return [...window.inputs.map((one) => one.name), ...window.steps.flatMap((step) => (step.results?.length ? step.results : [step.name]))];
}

const NEW_INPUT: Record<InKind, (window: Window) => WindowIn> = {
  file: (window) => ({ name: freshName('File', namesIn(window)), kind: 'file' }),
  folder: (window) => ({ name: freshName('Folder', namesIn(window)), kind: 'folder' }),
  text: (window) => ({ name: freshName('Text', namesIn(window)), kind: 'text' }),
  number: (window) => ({ name: freshName('Number', namesIn(window)), kind: 'number', min: 1, max: 100, step: 1, value: 10 }),
  choice: (window) => ({ name: freshName('Choice', namesIn(window)), kind: 'choice', options: ['short', 'long'], value: 'short' }),
  from: (window) => ({ name: freshName('From', namesIn(window)), kind: 'from' }),
};

const NEW_OUTPUT_NAME: Record<OutKind, string> = { text: 'Text', list: 'List', table: 'Table', chart: 'Chart', image: 'Image' };

/** The window with *change* applied to the window of that id. */
export function inWindow(doc: Windows, id: string, change: (window: Window) => Window): Windows {
  return { ...doc, windows: doc.windows.map((window) => (window.id === id ? change(window) : window)) };
}

/** A window with nothing in it yet but a first cell and a first output, on a page that has *others*. */
export function newWindow(doc: Windows, title = 'New window'): Window {
  const name = freshName(title, doc.windows.map((window) => window.title));
  let id = idOf(name);
  for (let n = 2; doc.windows.some((window) => window.id === id); n += 1) id = `${idOf(name)}_${n}`;
  return {
    id, title: name, span: 8,
    inputs: [{ name: 'Text', kind: 'text' }],
    steps: [{ name: 'Result', sentence: 'Say it more simply: @Text', how: 'ai' }],
    outputs: [{ name: 'Result', kind: 'text', rows: SIZES.text.M, of: 'Result' }],
  };
}

export const addWindow = (doc: Windows, title?: string): Windows => ({ ...doc, windows: [...doc.windows, newWindow(doc, title)] });

/** A window moved one place earlier (-1) or later (+1) on the page, which is the order it is read and run in. */
export function moveWindow(doc: Windows, id: string, by: -1 | 1): Windows {
  const at = doc.windows.findIndex((window) => window.id === id);
  const to = at + by;
  if (at < 0 || to < 0 || to >= doc.windows.length) return doc;
  const windows = doc.windows.slice();
  [windows[at], windows[to]] = [windows[to], windows[at]];
  return { ...doc, windows };
}

export const removeWindow = (doc: Windows, id: string): Windows => ({
  ...doc,
  // What took something from it no longer does: a dangling `from` is a problem nobody asked for.
  windows: doc.windows.filter((window) => window.id !== id).map((window) => ({
    ...window, inputs: window.inputs.filter((one) => one.from?.window !== id),
  })),
});

export const addInput = (doc: Windows, id: string, kind: InKind): Windows => inWindow(doc, id, (window) => {
  const made = NEW_INPUT[kind](window);
  if (kind === 'from') {
    // The first output of another window: the one thing a `from` can be right away.
    const other = doc.windows.find((one) => one.id !== id && one.outputs.length);
    if (other) made.from = { window: other.id, output: other.outputs[0].name };
  }
  return { ...window, inputs: [...window.inputs, made] };
});

export const addStep = (doc: Windows, id: string, how: Step['how'] = 'ai'): Windows => inWindow(doc, id, (window) => {
  const last = window.steps[window.steps.length - 1];
  const name = freshName(how === 'ai' ? 'Step' : 'Code', namesIn(window));
  const sentence = last ? `Continue with @${last.name}` : (window.inputs[0] ? `Do something with @${window.inputs[0].name}` : 'Say what should be done');
  return { ...window, steps: [...window.steps, { name, sentence, how, ...(how === 'code' ? { code: '' } : {}) }] };
});

export const addOutput = (doc: Windows, id: string, kind: OutKind): Windows => inWindow(doc, id, (window) => {
  const last = window.steps[window.steps.length - 1];
  const name = freshName(NEW_OUTPUT_NAME[kind], window.outputs.map((one) => one.name));
  return { ...window, outputs: [...window.outputs, { name, kind, rows: SIZES[kind].M, ...(last ? { of: (last.results?.[0] ?? last.name) } : {}) }] };
});

/** One cell of a window, by where it stands: which list and which place in it. */
export type CellRef = { list: 'inputs'; at: number } | { list: 'steps'; at: number } | { list: 'outputs'; at: number };

export function removeCell(doc: Windows, id: string, ref: CellRef): Windows {
  return inWindow(doc, id, (window) => {
    const without = <T,>(items: T[]): T[] => items.filter((_, at) => at !== ref.at);
    return ref.list === 'inputs' ? { ...window, inputs: without(window.inputs) }
      : ref.list === 'steps' ? { ...window, steps: without(window.steps) }
        : { ...window, outputs: without(window.outputs) };
  });
}

/** A cell moved one place up (-1) or down (+1) its list. Steps run in this order, so it matters. */
export function moveCell(doc: Windows, id: string, ref: CellRef, by: -1 | 1): Windows {
  return inWindow(doc, id, (window) => {
    const moved = <T,>(items: T[]): T[] => {
      const to = ref.at + by;
      if (to < 0 || to >= items.length) return items;
      const copy = items.slice();
      [copy[ref.at], copy[to]] = [copy[to], copy[ref.at]];
      return copy;
    };
    return ref.list === 'inputs' ? { ...window, inputs: moved(window.inputs) }
      : ref.list === 'steps' ? { ...window, steps: moved(window.steps) }
        : { ...window, outputs: moved(window.outputs) };
  });
}

/**
 * An input renamed, with the sentences that point at it: `@Old` becomes `@New`, so renaming is not
 * a way to break a window. The same for a step's name and an output that shows it.
 */
export function renameInput(doc: Windows, id: string, at: number, name: string): Windows {
  return inWindow(doc, id, (window) => {
    const old = window.inputs[at]?.name;
    if (old === undefined) return window;
    return {
      ...window,
      inputs: window.inputs.map((one, place) => (place === at ? { ...one, name } : one)),
      steps: window.steps.map((step) => ({ ...step, sentence: repoint(step.sentence, old, name) })),
    };
  });
}

export function renameStep(doc: Windows, id: string, at: number, name: string): Windows {
  return inWindow(doc, id, (window) => {
    const was = window.steps[at];
    if (!was) return window;
    const old = was.results?.length ? undefined : was.name;
    return {
      ...window,
      steps: window.steps.map((step, place) => {
        if (place === at) return { ...step, name };
        return old === undefined ? step : { ...step, sentence: repoint(step.sentence, old, name) };
      }),
      outputs: window.outputs.map((out) => (old !== undefined && out.of && idOf(out.of) === idOf(old) ? { ...out, of: name } : out)),
    };
  });
}

/** *sentence* with every `@old` made `@new` -- a mention's part (`@File.path`) stays, and a longer name that starts alike does not change. */
export function repoint(sentence: string, old: string, name: string): string {
  const wanted = idOf(old);
  const tag = name.trim().replace(/\s+/g, '_');
  return sentence.replace(/@([\p{L}\p{N}_-]+)/gu, (whole, found: string) => (idOf(found) === wanted ? `@${tag}` : whole));
}

/** The input at *at*, changed by *patch*. */
export const patchInput = (doc: Windows, id: string, at: number, patch: Partial<WindowIn>): Windows =>
  inWindow(doc, id, (window) => ({ ...window, inputs: window.inputs.map((one, place) => (place === at ? { ...one, ...patch } : one)) }));

export const patchStep = (doc: Windows, id: string, at: number, patch: Partial<Step>): Windows =>
  inWindow(doc, id, (window) => ({ ...window, steps: window.steps.map((one, place) => (place === at ? { ...one, ...patch } : one)) }));

export const patchOutput = (doc: Windows, id: string, at: number, patch: Partial<WindowOut>): Windows =>
  inWindow(doc, id, (window) => ({ ...window, outputs: window.outputs.map((one, place) => (place === at ? { ...one, ...patch } : one)) }));

export const patchWindow = (doc: Windows, id: string, patch: Partial<Window>): Windows => inWindow(doc, id, (window) => ({ ...window, ...patch }));

/**
 * An output given another kind keeps its name and what it shows, and gets the medium size of the new kind:
 * a chart left at the height of a text is the one thing a person would have to find out the hard way.
 */
export function kindOfOutput(doc: Windows, id: string, at: number, kind: OutKind): Windows {
  return patchOutput(doc, id, at, { kind, rows: SIZES[kind].M });
}

/** A new, empty page for a tool that is to be called *name*. */
export const blankPage = (name = 'My tool'): Windows => addWindow({ name, description: '', windows: [] }, 'First window');
