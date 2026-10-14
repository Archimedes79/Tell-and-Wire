import { describe, expect, it } from 'vitest';
import { readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { graphToWindows } from '../../gui/notebook/fromGraph.ts';
import { windowProblems, windowsToGraph, type Windows } from '../../gui/notebook/windows.ts';
import type { Graph } from '../../graph/graph.ts';
import { loadGraph } from '../deployment/project/folder.ts';
import { signatureOf } from './files.ts';

/**
 * The windows of a page, read back from the graph and the gui they made (`gui/notebook/fromGraph.ts`).
 *
 * The principle behind it: what is executed is the graph, what is shown is the gui, and the notebook's page is those two read as
 * windows -- the `@Name` of a sentence is only how a wire is written. So a notebook keeps no file of its own: this is how that is held.
 * A page that uses every kind of element is made into files and read back, and what comes back is the page, down to the last field;
 * every example is read from the files it is kept in, and makes the same files again.
 */

const REPO = resolve(__dirname, '..', '..');
const ROOT = join(REPO, 'notebook-examples');
const NAMES = readdirSync(ROOT, { withFileTypes: true }).filter((entry) => entry.isDirectory() && existsSync(join(ROOT, entry.name, 'gui.json'))).map((entry) => entry.name);

/**
 * Whether two graphs are what the windows make: the notebook's own reading of that (`signatureOf`: nodes with their words and ports, wires,
 * schedule, every block -- not where a card stands), and besides it the code of each cell and what a drawing cell is told of its window,
 * which the signature leaves to the cell.
 */
function sameGraph(one: Graph, other: Graph): void {
  expect(signatureOf(one)).toBe(signatureOf(other));
  const writing = (graph: Graph) => graph.nodes.map((node) => ({ id: node.id, code: typeof node.config.code === 'string' ? node.config.code.trimEnd() : undefined, window: node.config.window, notebook: node.config.notebook }));
  expect(writing(one)).toEqual(writing(other));
}

describe('the notebook examples, read from the files they are kept in', () => {
  it.each(NAMES)('%s: the windows are read from the graph and the gui, and make them again', async (name) => {
    const graph = await loadGraph(join(ROOT, name));
    const windows = graphToWindows(graph);
    expect(windows.windows.length).toBeGreaterThan(0);
    expect(windowProblems(windows)).toEqual([]);
    sameGraph(windowsToGraph(windows, graph), graph);
    // And what is read is a fixed point: windows made of the files make the files, which say the same windows.
    expect(graphToWindows(windowsToGraph(windows, graph))).toEqual(windows);
  });
});

/**
 * A page that uses every kind there is: windows that take from one another, a chat, a window with no button, a model's cell that was
 * code, a sentence with a quotation mark in it. Written the way the notebook reads a page back -- nothing in it that the files cannot
 * tell from what is left out (a width of the whole line, a number that starts at its lowest), and the blocks of windows named `w_<id>`.
 */
const EVERYTHING: Windows = {
  name: 'Everything', description: 'Every kind of input, output and step once.', scheme: 'night',
  windows: [
    {
      id: 'files', title: 'Files', span: 12,
      inputs: [
        { name: 'Pictures', kind: 'folder', extensions: '.png, .jpg', value: 'data/pictures', width: 0.5 },
        { name: 'Notes', kind: 'file', extensions: '.txt', width: 0.5, rows: 3 },
      ],
      steps: [{ name: 'Sizes', sentence: 'Measure each file of @Pictures.', how: 'code', code: 'function run(inputs) { return { sizes: inputs.pictures, count: 1 }; }', each: true, results: ['Sizes', 'Count'] }],
      outputs: [{ name: 'Sizes list', kind: 'list', rows: 3 }, { name: 'Count', kind: 'text', rows: 2, of: 'Count' }],
      trigger: { label: 'Measure' },
    },
    {
      id: 'report', title: 'Report', span: 12, ask: 'Which tone, and which title?',
      inputs: [
        { name: 'Sizes', kind: 'from', from: { window: 'files', output: 'Sizes list' } },
        { name: 'Tone', kind: 'choice', options: ['Plain', 'Warm'], value: 'Warm', width: 0.5 },
        { name: 'Title', kind: 'text', value: 'Hello', width: 0.5 },
        { name: 'Level', kind: 'number', min: 1, max: 9, step: 2, value: 3, width: 0.25 },
      ],
      steps: [
        { name: 'Summary', sentence: 'Write a @Tone summary of @Sizes under the title @Title.', how: 'ai', code: 'function run() { return { summary: 1 }; }' },
        { name: 'Table', sentence: 'Put @Summary and @Level in a table, quoting "Level".', how: 'code', code: 'function run(inputs) { return { table: [] }; }' },
      ],
      outputs: [
        { name: 'The table', kind: 'table', rows: 4, width: 0.5 },
        { name: 'The words', kind: 'text', rows: 4, width: 0.5, of: 'Summary' },
        { name: 'Plot', kind: 'chart', rows: 5 },
        { name: 'Picture', kind: 'image', rows: 4 },
      ],
      trigger: { onChange: true, label: 'Write it' },
    },
    {
      id: 'talk', title: 'Files', span: 8,
      inputs: [],
      steps: [{ name: 'Reply', sentence: 'Answer @Chat.message, knowing @Chat.history.', how: 'ai' }],
      outputs: [{ name: 'Chat', kind: 'chat', rows: 6 }],
    },
    {
      id: 'quiet', title: 'Quiet', span: 8,
      inputs: [{ name: 'Level', kind: 'number', max: 10, value: 5 }],
      steps: [{ name: 'Show', sentence: 'Show @Level.', how: 'code', code: 'function run(inputs) { return { show: inputs.level }; }' }],
      outputs: [{ name: 'Shown', kind: 'text', rows: 2 }],
      trigger: { button: false, onChange: true },
    },
    {
      id: 'notes', title: 'Notes', span: 16,
      inputs: [{ name: 'Folder', kind: 'folder' }],
      steps: [{ name: 'Words', sentence: 'Describe each file of @Folder.', how: 'ai', each: true }],
      // A text, where a model does the cell for each file: the end point takes a list, and the block says it is shown as a text.
      outputs: [{ name: 'Words', kind: 'text', rows: 3 }],
    },
  ],
  page: [
    { id: 'b1', kind: 'h1', text: 'Everything' },
    { id: 'b2', kind: 'p', text: 'A paragraph, with **bold** and a `code` word.' },
    { id: 'w_files', kind: 'window', window: 'files' },
    { id: 'b4', kind: 'ul', text: 'one\ntwo' },
    { id: 'w_report', kind: 'window', window: 'report' },
    { id: 'b6', kind: 'ol', text: 'first\nsecond' },
    { id: 'b7', kind: 'quote', text: 'Quoted.' },
    { id: 'b8', kind: 'space' },
    { id: 'b9', kind: 'h2', text: 'The rest' },
    { id: 'w_talk', kind: 'window', window: 'talk' },
    { id: 'w_quiet', kind: 'window', window: 'quiet' },
    { id: 'w_notes', kind: 'window', window: 'notes' },
  ],
};

describe('a page that uses everything, read back from what it made', () => {
  it('is a sound page to begin with', () => {
    expect(windowProblems(EVERYTHING)).toEqual([]);
  });

  it('comes back as the page it was, field for field, and makes the files again', () => {
    const graph = windowsToGraph(EVERYTHING);
    const back = graphToWindows(graph);
    expect(back).toEqual(EVERYTHING);
    sameGraph(windowsToGraph(back, graph), graph);
  });

  it('comes back from the files as they are written, too', () => {
    // The way a project is read: through JSON, with nothing of the document at hand.
    const graph = JSON.parse(JSON.stringify(windowsToGraph(EVERYTHING))) as Graph;
    expect(graphToWindows(graph)).toEqual(EVERYTHING);
    sameGraph(windowsToGraph(graphToWindows(graph), graph), graph);
  });

  it('has no page where the graph says none', () => {
    const { page: _, ...bare } = EVERYTHING;
    expect(graphToWindows(windowsToGraph(bare)).page).toBeUndefined();
  });

  it('takes an outside change that the windows can say as it is said', () => {
    const graph = windowsToGraph(EVERYTHING);
    // The graph editor words a cell differently, and a window's start point is given other words.
    graph.nodes.find((node) => node.id === 'report_table')!.description = 'Put "Summary" and "Level" in a nice table.';
    graph.nodes.find((node) => node.id === 'talk')!.description = 'Say something.';
    const back = graphToWindows(graph);
    expect(back.windows[1].steps[1].sentence).toBe('Put @Summary and @Level in a nice table.');
    expect(back.windows[2].ask).toBe('Say something.');
    expect(signatureOf(windowsToGraph(back, graph))).toBe(signatureOf(graph));
  });

  it('does not take a change the windows cannot say: made again, the graph differs', () => {
    const graph = windowsToGraph(EVERYTHING);
    graph.nodes.push({ ...graph.nodes.find((node) => node.id === 'report_table')!, id: 'extra', label: 'Extra' });
    expect(signatureOf(windowsToGraph(graphToWindows(graph), graph))).not.toBe(signatureOf(graph));
  });
});

describe('a graph made in the graph editor', () => {
  const EXAMPLES = join(REPO, 'examples');
  const NAMES_OF_EXAMPLES = readdirSync(EXAMPLES, { withFileTypes: true }).filter((entry) => entry.isDirectory() && existsSync(join(EXAMPLES, entry.name, 'graph-flow.json'))).map((entry) => entry.name);

  it('is no page: it has no window and no words', async () => {
    expect(NAMES_OF_EXAMPLES.length).toBeGreaterThan(0);
    for (const name of NAMES_OF_EXAMPLES) {
      const read = graphToWindows(await loadGraph(join(EXAMPLES, name)));
      expect([name, read.windows.length, read.page]).toEqual([name, 0, undefined]);
    }
  });
});
