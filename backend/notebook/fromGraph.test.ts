import { describe, expect, it } from 'vitest';
import { readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { graphToWindows } from '../../gui/notebook/fromGraph.ts';
import { windowProblems, windowsToGraph, resultsOf, type Windows } from '../../gui/notebook/windows.ts';
import type { Graph } from '../../graph/graph.ts';
import { loadGraph } from '../deployment/project/folder.ts';
import { readKept, signatureOf } from './files.ts';

/**
 * The windows of a page, read back from the graph and the gui they made (`gui/notebook/fromGraph.ts`).
 *
 * The principle behind it: what is executed is the graph, what is shown is the gui, and the notebook's page is those two read as
 * windows -- the `@Name` of a sentence is only how a wire is written. So `graph-windows.json` should say nothing the files beside it do
 * not. This is how that is held: every example and a page that uses everything are made into a graph and read back, and the windows
 * that come back make the same graph again (nothing the graph says is lost) and say the same (nothing the page says is lost) -- with
 * what is not kept written down in the last test, so that it is a decision and not a surprise.
 */

const ROOT = resolve(__dirname, '..', '..', 'notebook-examples');
const NAMES = readdirSync(ROOT, { withFileTypes: true }).filter((entry) => entry.isDirectory() && existsSync(join(ROOT, entry.name, 'graph-windows.json'))).map((entry) => entry.name);

/**
 * What a document says, without what two documents can say differently and make one graph: how wide an element is (the cells it takes,
 * which the graph's blocks say), a default written out or left out, `@File.content` for `@File`, the ids of the blocks of a page.
 */
function said(doc: Windows) {
  const plain = (sentence: string): string => sentence.replace(/@(\w+)\.content/g, '@$1');
  return {
    name: doc.name, description: doc.description, scheme: doc.scheme ?? 'white',
    windows: doc.windows.map((window) => ({
      id: window.id, title: window.title, span: window.span,
      inputs: window.inputs.map((one) => ({
        name: one.name, kind: one.kind, options: one.options, extensions: one.extensions || undefined, from: one.from,
        ...(one.kind === 'number' ? { min: one.min ?? 0, max: one.max ?? 100, step: one.step ?? 1, value: one.value ?? one.min ?? 0 } : { value: one.value || undefined }),
      })),
      steps: window.steps.map((step) => ({
        name: step.name, sentence: plain(step.sentence), how: step.how, code: step.how === 'code' ? step.code?.trimEnd() : undefined, each: step.each === true, results: resultsOf(step),
      })),
      outputs: window.outputs.map((one) => ({
        name: one.name, kind: one.kind === 'list' ? 'text' : one.kind,
        of: one.of ?? resultsOf(window.steps[window.steps.length - 1])[0],
      })),
      trigger: { button: window.trigger?.button !== false, label: window.trigger?.label || 'Run', onChange: window.trigger?.onChange === true },
    })),
    page: doc.page?.map((block) => ({ kind: block.kind, text: block.kind === 'space' || block.kind === 'window' ? undefined : block.text ?? '', window: block.window })),
  };
}

/**
 * Whether two graphs are what the windows make: the notebook's own reading of that (`signatureOf`: nodes with their words and ports, wires,
 * schedule, every block -- not where a card stands), and besides it the code of each cell and what a drawing cell is told of its window,
 * which the signature leaves to the cell.
 */
function sameGraph(one: Graph, other: Graph): void {
  expect(signatureOf(one)).toBe(signatureOf(other));
  const writing = (graph: Graph) => graph.nodes.map((node) => ({ id: node.id, code: typeof node.config.code === 'string' ? node.config.code.trimEnd() : undefined, window: node.config.window }));
  expect(writing(one)).toEqual(writing(other));
}

describe('the notebook examples, read back from their files', () => {
  it.each(NAMES)('%s: the graph on disk and the gui make the windows the notebook kept', async (name) => {
    const folder = join(ROOT, name);
    const kept = (await readKept(folder))!.windows;
    const graph = await loadGraph(folder);
    const back = graphToWindows(graph);
    expect(windowProblems(back)).toEqual([]);
    expect(said(back)).toEqual(said(kept));
    // And they make the graph that is on disk, down to the words, the ports, the wires, the schedule and every block.
    sameGraph(windowsToGraph(back, graph), graph);
  });
});

/** A page that uses every kind there is: three windows that take from one another, a chat, a window with no button. */
const EVERYTHING: Windows = {
  name: 'Everything', description: 'Every kind of input, output and step once.', scheme: 'night',
  windows: [
    {
      id: 'files', title: 'Files', span: 12,
      inputs: [
        { name: 'Pictures', kind: 'folder', extensions: '.png, .jpg', value: 'data/pictures', width: 0.5 },
        { name: 'Notes', kind: 'file', extensions: '.txt', width: 0.5 },
      ],
      steps: [{ name: 'Sizes', sentence: 'Measure each file of @Pictures.', how: 'code', code: 'function run(inputs) { return { sizes: inputs.pictures, count: 1 }; }', each: true, results: ['Sizes', 'Count'] }],
      outputs: [{ name: 'Sizes list', kind: 'list', rows: 3, of: 'Sizes' }, { name: 'Count', kind: 'list', rows: 2, of: 'Count' }],
      trigger: { label: 'Measure' },
    },
    {
      id: 'report', title: 'Report', span: 12,
      inputs: [
        { name: 'Sizes', kind: 'from', from: { window: 'files', output: 'Sizes list' } },
        { name: 'Tone', kind: 'choice', options: ['Plain', 'Warm'], value: 'Warm', width: 0.5 },
        { name: 'Title', kind: 'text', value: 'Hello', width: 0.5 },
        { name: 'Level', kind: 'number', min: 1, max: 9, step: 2, value: 3, width: 0.25 },
      ],
      steps: [
        { name: 'Summary', sentence: 'Write a @Tone summary of @Sizes under the title @Title.', how: 'ai' },
        { name: 'Table', sentence: 'Put @Summary and @Level in a table.', how: 'code', code: 'function run(inputs) { return { table: [] }; }' },
      ],
      outputs: [
        { name: 'The table', kind: 'table', rows: 4, width: 0.5 },
        { name: 'The words', kind: 'text', rows: 4, width: 0.5, of: 'Table' },
        { name: 'Plot', kind: 'chart', rows: 5 },
        { name: 'Picture', kind: 'image', rows: 4 },
      ],
      trigger: { onChange: true, label: 'Write it' },
    },
    {
      id: 'talk', title: 'Talk', span: 8,
      inputs: [],
      steps: [{ name: 'Reply', sentence: 'Answer @Chat.message, knowing @Chat.history.', how: 'ai' }],
      outputs: [{ name: 'Chat', kind: 'chat', rows: 6 }],
    },
    {
      id: 'quiet', title: 'Quiet', span: 8,
      inputs: [{ name: 'Level', kind: 'number', min: 0, max: 10, step: 1, value: 5 }],
      steps: [{ name: 'Show', sentence: 'Show @Level.', how: 'code', code: 'function run(inputs) { return { show: inputs.level }; }' }],
      outputs: [{ name: 'Shown', kind: 'text', rows: 2 }],
      trigger: { button: false, onChange: true },
    },
  ],
  page: [
    { id: 'b1', kind: 'h1', text: 'Everything' },
    { id: 'b2', kind: 'p', text: 'A paragraph, with **bold** and a `code` word.' },
    { id: 'b3', kind: 'window', window: 'files' },
    { id: 'b4', kind: 'ul', text: 'one\ntwo' },
    { id: 'b5', kind: 'window', window: 'report' },
    { id: 'b6', kind: 'ol', text: 'first\nsecond' },
    { id: 'b7', kind: 'quote', text: 'Quoted.' },
    { id: 'b8', kind: 'space' },
    { id: 'b9', kind: 'h2', text: 'The rest' },
    { id: 'b10', kind: 'window', window: 'talk' },
    { id: 'b11', kind: 'window', window: 'quiet' },
  ],
};

describe('a page that uses everything, read back from what it made', () => {
  it('is a sound page to begin with', () => {
    expect(windowProblems(EVERYTHING)).toEqual([]);
  });

  it('comes back as the windows it was, and makes the graph again', () => {
    const graph = windowsToGraph(EVERYTHING);
    const back = graphToWindows(graph);
    expect(said(back)).toEqual(said(EVERYTHING));
    sameGraph(windowsToGraph(back, graph), graph);
  });

  it('comes back from the files as they are written, too', () => {
    // The way a project is read: through JSON, with nothing of the document at hand.
    const graph = JSON.parse(JSON.stringify(windowsToGraph(EVERYTHING)));
    sameGraph(windowsToGraph(graphToWindows(graph), graph), graph);
  });

  it('has no page where the graph says none', () => {
    const { page: _, ...bare } = EVERYTHING;
    expect(graphToWindows(windowsToGraph(bare)).page).toBeUndefined();
  });
});

/**
 * What the files do not keep. Each is a decision to make, not a bug: a thing the page says that the graph and the gui have no place
 * for. Until it has one, a page that is read back from them loses it -- and this is where that is written down.
 */
describe('what the graph and the gui do not keep of a page', () => {
  const one = (change: (window: Windows['windows'][number]) => void): Windows => {
    const doc: Windows = JSON.parse(JSON.stringify(EVERYTHING));
    change(doc.windows.find((window) => window.id === 'report')!);
    return doc;
  };

  it('what a window asks of the person (`ask`)', () => {
    const doc = one((window) => { window.ask = 'Which tone?'; });
    expect(graphToWindows(windowsToGraph(doc)).windows[1].ask).toBeUndefined();
  });

  it('the code of a cell a model does: it is not in the graph while a model does it', () => {
    const doc = one((window) => { window.steps[0].code = 'function run() {}'; });
    expect(graphToWindows(windowsToGraph(doc)).windows[1].steps[0].code).toBeUndefined();
  });

  it('a text from a list, where a model does a cell for each file: only a cell of code is told what its output is', () => {
    const doc: Windows = JSON.parse(JSON.stringify(EVERYTHING));
    const files = doc.windows[0];
    files.steps = [{ name: 'Sizes', sentence: 'Describe each file of @Pictures.', how: 'ai', each: true }];
    files.outputs = [{ name: 'Sizes list', kind: 'text', rows: 3 }];
    // Both end in an end point that takes a list, and nothing in the graph says which one it was written as.
    expect(windowsToGraph(graphToWindows(windowsToGraph(doc))).edges).toEqual(windowsToGraph(doc).edges);
    expect(graphToWindows(windowsToGraph(doc)).windows[0].outputs[0].kind).toBe('list');
  });

  it('a text from a list, where code does a cell for each file: its cell is told, so it is kept', () => {
    const doc: Windows = JSON.parse(JSON.stringify(EVERYTHING));
    doc.windows[0].outputs[1] = { ...doc.windows[0].outputs[1], kind: 'text' };
    expect(graphToWindows(windowsToGraph(doc)).windows[0].outputs[1].kind).toBe('text');
  });

  it('a quotation mark around a name that is also an input is read as a mention again', () => {
    const doc = one((window) => { window.steps[0].sentence = 'Say "Tone" for @Tone and @Sizes.'; });
    expect(graphToWindows(windowsToGraph(doc)).windows[1].steps[0].sentence).toBe('Say @Tone for @Tone and @Sizes.');
  });

  it('which window an input takes from, where two have the same title', () => {
    const doc: Windows = JSON.parse(JSON.stringify(EVERYTHING));
    doc.windows[2].title = 'Files';
    expect(graphToWindows(windowsToGraph(doc)).windows[1].inputs[0].from?.window).toBe('files');
    doc.windows[0].title = 'Same';
    doc.windows[1].inputs[0].from = { window: 'files', output: 'Sizes list' };
    doc.windows[3].title = 'Same';
    expect(graphToWindows(windowsToGraph(doc)).windows[1].inputs[0].from?.window).toBe('files');
  });
});
