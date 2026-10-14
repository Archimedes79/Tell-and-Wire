// Changing windows: the small edits a person makes to a page, each one a function from windows to windows.
//
// Pure, so the editor's buttons are a line each and what they do is tested without a page. Nothing here
// changes its argument: an edit returns the document it made, which is what makes undo a list of them.

import { idOf, resultsOf, taken, type InKind, type OutKind, type Step, type Window, type WindowIn, type WindowOut, type Windows, SIZES } from './windows.ts';

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

const NEW_OUTPUT_NAME: Record<OutKind, string> = { text: 'Text', list: 'List', table: 'Table', chart: 'Chart', image: 'Image', chat: 'Chat' };

/** The window with *change* applied to the window of that id. */
export function inWindow(doc: Windows, id: string, change: (window: Window) => Window): Windows {
  return { ...doc, windows: doc.windows.map((window) => (window.id === id ? change(window) : window)) };
}

/** A window with nothing in it yet but a first cell and a first output, on a page that has *others*. */
export function newWindow(doc: Windows, title = 'New window'): Window {
  const name = freshName(title, doc.windows.map((window) => window.title));
  // "New window 2" is `new_window2`, not `new_window_2`: no id begins another's followed by an underscore, as the nodes of a window are named.
  let id = idOf(name).replace(/_(\d+)$/, '$1');
  // "new_window2", not "new_window_2": no window's id begins another's followed by an underscore, as the nodes of a window do.
  for (let n = 2; doc.windows.some((window) => window.id === id); n += 1) id = `${idOf(name)}${n}`;
  return {
    id, title: name, span: 8,
    inputs: [{ name: 'Text', kind: 'text' }],
    steps: [{ name: 'Result', sentence: 'Say it more simply: @Text', how: 'ai' }],
    outputs: [{ name: 'Result', kind: 'text', rows: SIZES.text.M, of: 'Result' }],
  };
}

export const addWindow = (doc: Windows, title?: string): Windows => ({ ...doc, windows: [...doc.windows, newWindow(doc, title)] });

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

/** What a new code cell starts with: it runs as it is, handing on what it was given, so a change to it is a change to something that works. */
export function seedCode(window: Window, at: number): string {
  const step = window.steps[at];
  const ids = taken(window, at).map((one) => idOf(one.name) + (one.part === 'path' ? '_path' : ''));
  return `function run(inputs) {
  // inputs: ${ids.join(', ') || 'none'}
  return { ${idOf(resultsOf(step)[0])}: Object.values(inputs).join('\n') };
}
`;
}

export const addStep = (doc: Windows, id: string, how: Step['how'] = 'ai'): Windows => inWindow(doc, id, (window) => {
  const last = window.steps[window.steps.length - 1];
  const name = freshName(how === 'ai' ? 'Step' : 'Code', namesIn(window));
  const sentence = last ? `Continue with @${last.name}` : (window.inputs[0] ? `Do something with @${window.inputs[0].name}` : 'Say what should be done');
  const made = { ...window, steps: [...window.steps, { name, sentence, how } as Step] };
  return how === 'code' ? { ...made, steps: made.steps.map((step, at) => (at === made.steps.length - 1 ? { ...step, code: seedCode(made, at) } : step)) } : made;
});

/** A cell given to a model or to code. Code is seeded where there is none, and kept when it is switched away from and back. */
export const setHow = (doc: Windows, id: string, at: number, how: Step['how']): Windows => inWindow(doc, id, (window) => {
  const step = window.steps[at];
  if (!step || step.how === how) return window;
  const code = how === 'code' ? (step.code?.trim() ? step.code : seedCode(window, at)) : step.code;
  return { ...window, steps: window.steps.map((one, place) => (place === at ? { ...one, how, ...(code ? { code } : {}) } : one)) };
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
      : ref.list === 'steps' ? withoutStep(window, ref.at)
        : { ...window, outputs: without(window.outputs) };
  });
}

/**
 * *window* without its step *at*. An output that showed one of the step's results shows what the last step makes instead, as an
 * output that says nothing does -- not a result no cell makes any more.
 */
function withoutStep(window: Window, at: number): Window {
  const gone = new Set(resultsOf(window.steps[at]).map(idOf));
  return {
    ...window,
    steps: window.steps.filter((_, place) => place !== at),
    outputs: window.outputs.map((out) => {
      if (!out.of || !gone.has(idOf(out.of))) return out;
      const { of: _of, ...rest } = out;
      return rest;
    }),
  };
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
      // An output that shows it and is called by the same name goes on being called what it shows.
      outputs: window.outputs.map((out) => {
        const shows = old !== undefined && (out.of ? idOf(out.of) === idOf(old) : at === window.steps.length - 1);
        return shows ? { ...out, of: name, ...(idOf(out.name) === idOf(old!) ? { name } : {}) } : out;
      }),
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

/**
 * The output at *at*, changed by *patch*. Renamed, what points at it follows, as it does for an input or a step: the windows that take it
 * (`from`), and -- for a chat, whose name is what `@Chat.message` says -- the cells of its own window.
 */
export function patchOutput(doc: Windows, id: string, at: number, patch: Partial<WindowOut>): Windows {
  const was = doc.windows.find((window) => window.id === id)?.outputs[at];
  const changed = inWindow(doc, id, (window) => ({ ...window, outputs: window.outputs.map((one, place) => (place === at ? { ...one, ...patch } : one)) }));
  if (!was || patch.name === undefined || patch.name === was.name) return changed;
  const name = patch.name;
  return {
    ...changed,
    windows: changed.windows.map((window) => {
      if (window.id === id) return was.kind === 'chat' ? { ...window, steps: window.steps.map((step) => ({ ...step, sentence: repoint(step.sentence, was.name, name) })) } : window;
      return { ...window, inputs: window.inputs.map((one) => (one.from?.window === id && one.from.output === was.name ? { ...one, from: { ...one.from, output: name } } : one)) };
    }),
  };
}

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

/**
 * The tool under another name. A page whose first heading is the name -- as a new page's is, and a page that has not changed it --
 * keeps saying the name, so the page and the name at the top do not drift apart while one is typed.
 */
export function renameTool(doc: Windows, name: string): Windows {
  const first = doc.page?.findIndex((block) => block.kind === 'h1');
  if (!doc.page || first === undefined || first < 0 || doc.page[first].text !== doc.name) return { ...doc, name };
  return { ...doc, name, page: doc.page.map((block, at) => (at === first ? { ...block, text: name } : block)) };
}
