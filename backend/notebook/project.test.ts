import { describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Graph } from '../../graph/graph.ts';
import { columnsOf, parseTable } from '../../graph/schedule.ts';
import { problemsIn } from '../../gui/authoring/check.ts';
import {
  afterEdit, afterRun, runOrder, windowProblems, windowRows, windowsToGraph, type Done, type Window, type Windows,
} from '../../gui/notebook/windows.ts';
import { quietRuntime } from '../deployment/runtime/test/fakes.ts';
import { nodeCode } from '../deployment/runtime/services.ts';
import { Session } from '../deployment/host/session.ts';
import { guiHooks } from '../deployment/gui/hooks.ts';
import { loadGraph } from '../deployment/project/folder.ts';
import { writeProject } from '../authoring/write.ts';

/**
 * Windows are said once and run as any graph runs: they become a graph and a
 * gui, are written as a project folder, read back, and used through a session.
 * And what the shipped examples are, a few windows say as well.
 */

const REPO = resolve(__dirname, '..', '..');

const DOC: Windows = {
  name: 'Texts',
  description: 'Summarize a text, say it in English, summarize a folder.',
  scheme: 'paper',
  windows: [
    {
      id: 'summarize', title: 'Summarize', span: 8,
      inputs: [{ name: 'Text', kind: 'text', value: 'A long text.' }, { name: 'Length', kind: 'choice', options: ['One sentence', 'Three sentences'] }],
      steps: [{ name: 'Summary', sentence: 'Summarize @Text in @Length.', how: 'ai' }],
      outputs: [{ name: 'Summary', kind: 'text', rows: 3 }],
    },
    {
      id: 'english', title: 'In English', span: 8,
      inputs: [{ name: 'Summary', kind: 'from', from: { window: 'summarize', output: 'Summary' } }],
      steps: [{ name: 'English', sentence: 'Say @Summary in English.', how: 'ai' }],
      outputs: [{ name: 'English', kind: 'text', rows: 2 }],
    },
    {
      id: 'stories', title: 'Each story', span: 16,
      inputs: [{ name: 'Folder', kind: 'folder', extensions: '.txt' }],
      steps: [{ name: 'Each story', sentence: 'Give the title and two sentences for @Folder.', how: 'ai', each: true }],
      outputs: [{ name: 'Summaries', kind: 'list', rows: 5 }],
    },
  ],
};

/** A model that numbers its answers, and every request it was asked. */
function model() {
  const asked: string[] = [];
  const runtime = () => quietRuntime({ ai: { complete: async (request) => { asked.push(JSON.stringify(request)); return `answer ${asked.length}`; } } });
  return { asked, runtime };
}

/** The windows of the examples, said as windows -- and as wired as the examples are. */
const one = (id: string, title: string, inputs: Window['inputs'], steps: Window['steps'], outputs: Window['outputs']): Windows => ({
  name: title, description: '', windows: [{ id, title, span: 16, inputs, steps, outputs }],
});
const REVIEWERS = [['Scientific', 'Scientific'], ['Adversarial', 'Adversarial'], ['Evidence & claims', 'Claims'], ['References', 'References'], ['Figures & tables', 'Figures']];
const EXAMPLES: Record<string, Windows> = {
  file_summarizer: one('summarize', 'Summarize',
    [{ name: 'File', kind: 'file', extensions: '.txt,.md' }, { name: 'Length', kind: 'choice', options: ['One sentence', 'Three sentences'] }],
    [
      { name: 'Read file', sentence: 'Read @File and @File.path: hand the text on, and say in one line what the file is.', how: 'code', code: 'function run(inputs) { return {}; }', results: ['Text', 'Info'] },
      { name: 'Summarize', sentence: 'Summarize @Text in @Length.', how: 'ai' },
    ],
    [
      { name: 'Summary', kind: 'text', rows: 5, of: 'Summarize' }, { name: 'About the file', kind: 'text', rows: 5, of: 'Info' }, { name: 'What was read', kind: 'text', rows: 6, of: 'Text' },
    ]),
  folder_summaries: one('chosen', 'Folder chosen',
    [{ name: 'Folder', kind: 'folder', extensions: '.txt' }],
    [{ name: 'Each file', sentence: 'Summarize each story in @Folder: its title and two sentences.', how: 'ai', each: true }],
    [{ name: 'Summaries', kind: 'list', rows: 5, of: 'Each file' }]),
  population_plotter: one('draw', 'Draw',
    [{ name: 'File', kind: 'file', extensions: '.csv' }],
    [{ name: 'What to plot', sentence: 'Read @File and say what the chart should show.', how: 'code', code: 'function run(inputs) { return {}; }', results: ['Figure'] }],
    [{ name: 'Chart', kind: 'chart', rows: 5, of: 'Figure' }]),
  paper_review_panel: one('review', 'Review',
    [{ name: 'Paper', kind: 'file' }],
    [
      { name: 'Read manuscript', sentence: 'Read @Paper and hand its text on.', how: 'code', code: 'function run(inputs) { return {}; }', results: ['Text'] },
      ...REVIEWERS.map(([name, result]) => ({ name, sentence: `Review @Text as the ${name} reviewer.`, how: 'ai' as const, results: [result] })),
      { name: 'Judge', sentence: 'Weigh @Scientific, @Adversarial, @Claims, @References and @Figures into one ranked list.', how: 'ai' },
    ],
    [
      { name: 'Judge — consolidated advice', kind: 'text', rows: 6, of: 'Judge' },
      ...REVIEWERS.map(([name, result]) => ({ name: `${name} reviewer`, kind: 'text' as const, rows: 4, of: result })),
    ]),
};

/** Which kind of node wires to which kind, by heading: the shape of a graph, whatever its ids and ports are called. */
const shape = (graph: Graph): string[] => graph.edges.map((edge) => {
  const [from, to] = [edge.source_node_id, edge.target_node_id].map((id) => graph.nodes.find((node) => node.id === id)!);
  return `${from.node_type}:${from.label} -> ${to.node_type}:${to.label}`;
}).sort();

describe('which windows run', () => {
  const chain: Windows = {
    name: 'Chain', description: '',
    windows: ['a', 'b', 'c', 'd'].map((id, at) => ({
      id, title: id, span: 8,
      inputs: [at === 0 || id === 'd' ? { name: 'Text', kind: 'text' as const } : { name: 'Before', kind: 'from' as const, from: { window: ['a', 'b', 'c'][at - 1], output: 'Out' } }],
      steps: [{ name: 'Do', sentence: id === 'a' || id === 'd' ? 'Do @Text.' : 'Do @Before.', how: 'ai' as const }],
      outputs: [{ name: 'Out', kind: 'text' as const, rows: 2 }],
    })),
  };
  const nothing: Done = { ran: new Set<string>(), changed: new Set<string>() };

  it('are the ones before it that are not current, then it, and never one it does not take from', () => {
    expect(runOrder(chain, 'c', nothing)).toEqual(['a', 'b', 'c']);
    const all = ['a', 'b', 'c'].reduce((done, id) => afterRun(chain, done, id), nothing);
    expect(runOrder(chain, 'c', all)).toEqual(['c']);
    // An input of the first changed: all that follow it answer to something that is gone.
    expect(runOrder(chain, 'c', afterEdit(all, 'a'))).toEqual(['a', 'b', 'c']);
    expect(runOrder(chain, 'c', afterEdit(all, 'b'))).toEqual(['b', 'c']);
    // Running the first again leaves the ones after it behind it: they have not seen what it made.
    expect(runOrder(chain, 'c', afterRun(chain, all, 'a'))).toEqual(['b', 'c']);
    expect(runOrder(chain, 'd', nothing)).toEqual(['d']);
  });
});

describe('windows', () => {
  it('become a graph and a gui that check accepts, and a project folder that reads back as it was written', async () => {
    expect(windowProblems(DOC)).toEqual([]);
    const graph = windowsToGraph(DOC);
    expect(problemsIn(graph)).toEqual([]);
    expect(graph.metadata.gui_scheme).toBe('paper');
    expect(graph.nodes.filter((node) => node.node_type === 'start').map((node) => node.id)).toEqual(['summarize', 'english', 'stories']);
    expect(graph.nodes.find((node) => node.id === 'stories_each_story')!.config).toEqual({ batch_mode: 'per_item', batch_concurrency: 3 });
    // A window is as tall as its elements say: heading, a text box of two rows and a choice, Run and sentence, three rows of output.
    expect(windowRows(DOC.windows[0])).toBe(1 + (2 + 2) + 1 + 3);
    // Two outputs that fit side by side share a line, and the line is as tall as the taller.
    const side = { ...DOC.windows[0], span: 16, outputs: [{ name: 'A', kind: 'text' as const, rows: 3, width: 0.625 }, { name: 'B', kind: 'text' as const, rows: 5, width: 0.375 }] };
    expect(windowRows(side)).toBe(1 + (2 + 2) + 1 + 5);
    expect(windowsToGraph({ ...DOC, windows: [side] }).gui!.blocks.filter((block) => block.shows).map((block) => [block.w, block.h])).toEqual([[10, 5], [6, 5]]);

    // What a model wrote for a step survives a new sentence, but not a step that is not the same any more.
    const step = (made: typeof graph) => made.nodes.find((node) => node.id === 'summarize_summary')!;
    step(graph).config.prompt = 'Summarize the text in the length asked.';
    const reworded = { ...DOC, windows: [{ ...DOC.windows[0], steps: [{ ...DOC.windows[0].steps[0], sentence: 'Sum up @Text in @Length.' }] }, ...DOC.windows.slice(1)] };
    expect(step(windowsToGraph(reworded, graph)).config.prompt).toBe('Summarize the text in the length asked.');
    expect(step(windowsToGraph(reworded, graph)).description).toBe('Sum up "Text" in "Length".');
    expect(step(windowsToGraph(DOC)).config.prompt).toBeUndefined();
    const asCode = { ...DOC, windows: [{ ...DOC.windows[0], steps: [{ ...DOC.windows[0].steps[0], how: 'code' as const }] }, ...DOC.windows.slice(1)] };
    expect(step(windowsToGraph(asCode, graph)).config.prompt).toBeUndefined();

    // Position is order: a window stands in a row, left to right as its cells do, and the window that takes from another stands to the right of what it takes.
    const column = columnsOf(parseTable(graph.schedule!));
    expect([column.get('summarize'), column.get('summarize_summary'), column.get('summarize_out_summary')]).toEqual([0, 1, 2]);
    expect([column.get('english'), column.get('english_english'), column.get('english_out_english')]).toEqual([1, 2, 3]);
    expect(column.get('stories_each_story')).toBe(1);

    const folder = await mkdtemp(join(tmpdir(), 'windows-'));
    await writeProject(folder, graph);
    // What was written is read back as a graph that checks (the graph editor's own check of a folder is the editor's, and not used here).
    const again = await loadGraph(folder);
    expect(problemsIn(again)).toEqual([]);
    expect(again.schedule).toEqual(graph.schedule);
    expect(again.edges.map((edge) => edge.id)).toEqual(graph.edges.map((edge) => edge.id));
    // What groups the blocks into windows survives the file.
    expect(again.gui!.blocks.filter((block) => block.group === 'summarize')).toHaveLength(graph.gui!.blocks.filter((block) => block.group === 'summarize').length);
  });

  it('start by what the window says -- a button with its words, a change of an input, or both -- and hand each output\'s needs to the model', () => {
    const start = (trigger: Window['trigger']) => windowsToGraph({ ...DOC, windows: [{ ...DOC.windows[0], trigger }] }).gui!.blocks;
    const press = (blocks: ReturnType<typeof start>) => blocks.find((block) => block.id === 'summarize_run');
    expect(press(start(undefined))).toMatchObject({ kind: 'button', label: 'Run', fires: 'summarize' });
    expect(press(start({ label: 'Summarize now' }))).toMatchObject({ label: 'Summarize now' });
    expect(start({ onChange: true }).filter((block) => block.sends_to).map((block) => block.fires)).toEqual(['summarize', 'summarize']);
    expect(start({}).filter((block) => block.sends_to).map((block) => block.fires)).toEqual([undefined, undefined]);
    const quiet = { ...DOC, windows: [{ ...DOC.windows[0], trigger: { button: false } }] };
    expect(windowProblems(quiet).map((one) => one.problem)).toEqual(['Nothing starts it: it has no button and a change of an input does not run it.']);
    expect(press(windowsToGraph({ ...quiet, windows: [{ ...quiet.windows[0], trigger: { button: false, onChange: true } }] }).gui!.blocks)).toBeUndefined();

  });

  it('run window by window: one that takes from another gets its answer, and the other is not asked again', async () => {
    const { asked, runtime } = model();
    const session = await Session.open(windowsToGraph(DOC), { runtime, gui: guiHooks });

    const first = await session.run({ node_id: 'summarize', port_id: 'data' }, { by: 'summarize_run' });
    expect(first.status).toBe('success');
    expect(first.outputs).toEqual({ Summary: { value: 'answer 1' } });
    expect(session.view().shown).toMatchObject({ summarize_out_summary: 'answer 1' });

    const second = await session.run({ node_id: 'english', port_id: 'data' }, { by: 'english_run' });
    expect(second.status).toBe('success');
    expect(asked[1]).toContain('answer 1');
    expect(asked).toHaveLength(2);
    expect(session.view().shown).toMatchObject({ summarize_out_summary: 'answer 1', english_out_english: 'answer 2' });
  });
});

describe('code that draws for a window', () => {
  const DRAW: Windows = {
    name: 'Drawing', description: '', scheme: 'night',
    windows: [{
      id: 'draw', title: 'Draw', span: 8,
      inputs: [{ name: 'Text', kind: 'text', value: 'a b c' }],
      steps: [
        { name: 'Count', sentence: 'Count the words of @Text.', how: 'code', code: 'function run(inputs) { return { count: 3 }; }' },
        { name: 'Figure', sentence: 'Draw @Count.', how: 'code', code: 'function run(inputs, node) { return { figure: node.window.shows[0].width }; }' },
        { name: 'Say', sentence: 'Say what @Figure shows.', how: 'ai' },
      ],
      outputs: [{ name: 'Plot', kind: 'chart', rows: 5, width: 0.5, of: 'Figure' }, { name: 'Words', kind: 'text', rows: 2, of: 'Say' }],
    }],
  };

  it('is told its window: the room of what it feeds in pixels, the scheme as values -- an AI step is told nothing, a step feeding nothing has no room', () => {
    const nodes = windowsToGraph(DRAW).nodes;
    const told = (id: string) => nodes.find((node) => node.id === id)!.config.window as Record<string, any> | undefined;
    // A chart 4 cells across and 5 down, in a window of 8: 4 cells of the window (56 less its padding and border shared out) and 3 gaps, less the card of the block; 5 rows of 56 and 4 gaps, less the card.
    expect(told('draw_figure')).toMatchObject({
      id: 'draw', title: 'Draw', span: 8, rows: 11, page: { columns: 16, cell: 56, gap: 14 },
      shows: [{ output: 'Plot', kind: 'chart', result: 'Figure', cells: 4, rows: 5, width: 223, height: 294 }],
      scheme: { id: 'night', light: false, background: '#0f1117', text: '#e2e8f0', accent: '#6164ec' },
    });
    expect(told('draw_figure')!.scheme.series).toHaveLength(8);
    expect(told('draw_count')!.shows).toEqual([]);
    expect(told('draw_say')).toBeUndefined();
    // The scheme the page is set to, and white where it says none.
    expect(windowsToGraph({ ...DRAW, scheme: undefined }).nodes.find((node) => node.id === 'draw_figure')!.config.window).toMatchObject({ scheme: { id: 'white', light: true } });
  });

  it('reads it as node.window when it runs, in the sandbox a graph runs it in', async () => {
    const runtime = () => quietRuntime({ ai: { complete: async () => 'said' }, code: nodeCode });
    const session = await Session.open(windowsToGraph(DRAW), { runtime, gui: guiHooks });
    const done = await session.run({ node_id: 'draw', port_id: 'data' }, { by: 'draw_run' });
    expect(done.status).toBe('success');
    expect(session.view().shown).toMatchObject({ draw_out_plot: 223 });
  });
});

describe('the examples', () => {
  it.each(Object.keys(EXAMPLES))('%s is wired by windows as it is by its own files', async (name) => {
    expect(windowProblems(EXAMPLES[name])).toEqual([]);
    const real = await loadGraph(resolve(REPO, 'examples', name));
    const made = windowsToGraph(EXAMPLES[name]);
    expect(shape(made)).toEqual(shape(real));
    expect(made.nodes.map((node) => `${node.node_type}:${node.label}`).sort()).toEqual(real.nodes.map((node) => `${node.node_type}:${node.label}`).sort());
  });
});
