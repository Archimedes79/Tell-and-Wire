import { describe, it, expect } from 'vitest';
import { parseGraph, type Graph } from '../../../graph/graph.ts';
import { registry } from '../../../graph/nodes/registry.ts';
import { pageBlock, pageProblems, pageSends, settlePage } from './page.ts';
import { quietRuntime } from '../../../graph/test/fakes.ts';

/**
 * The page a graph is used through: blocks that connect themselves to the
 * graph's start and end points by name. Nothing is wired to a block; what a
 * round the page starts is sent is made here, and what it hands back is
 * settled here.
 */

/** A page for a summarizer: a file, a length, a Go button, the summary shown, a chart. */
const tool = (): Graph => parseGraph({
  metadata: { name: 'tool' },
  nodes: [
    { id: 'summarize', node_type: 'start', config: { started_by: 'page' } },
    { id: 'api', node_type: 'start', config: { started_by: 'call' } },
    { id: 'summary', node_type: 'end', config: {} },
    { id: 'plot', node_type: 'end', config: {} },
  ],
  page: {
    blocks: [
      { id: 'title', kind: 'text', value: 'Summaries' },
      { id: 'file', kind: 'input_picker', label: 'File', value: '', sends_to: ['summarize'] },
      { id: 'length', kind: 'select', label: 'Length', options: 'short\nlong', value: 'long', sends_to: ['summarize'], fires: 'summarize' },
      { id: 'go', kind: 'button', label: 'Go', fires: 'summarize' },
      { id: 'shown', kind: 'text_io', mode: 'output', shows: 'summary' },
      { id: 'note', kind: 'text_io', mode: 'input', value: 'a note', sends_to: ['summarize'], fires: 'summarize' },
      { id: 'chart', kind: 'plot_window', shows: 'plot' },
    ],
  },
});

describe('the page, connected by name', () => {
  it('is checked: a page that connects only to points the graph has says nothing, one that connects to what is not there is named', () => {
    const problems = (blocks: Record<string, unknown>[]) => pageProblems(parseGraph({ ...tool(), page: { blocks } }), registry)
      .map((problem) => problem.problem);
    expect(pageProblems(tool(), registry)).toEqual([]);
    expect(problems([
      { id: 'go', kind: 'button', fires: 'summarise' },
      { id: 'head', kind: 'text', fires: 'summarize' },
      { id: 'ring', kind: 'button', fires: 'api' },
      { id: 'pick', kind: 'input_picker', sends_to: ['nowhere'] },
      { id: 'press', kind: 'button', sends_to: ['summarize'] },
      { id: 'out', kind: 'table', shows: 'nothing' },
      { id: 'loose', kind: 'select', options: 'a' },
    ])).toEqual([
      'It fires "summarise", which is no start point of the graph: it starts "summarize", "api".',
      'It fires "summarize", but using it is no event.',
      'It fires "api", which is not started by the page.',
      'It sends to "nowhere", which is no start point of the graph: it starts "summarize", "api".',
      'It sends to "summarize", but it holds nothing to send.',
      'It shows "nothing", which is no end point of the graph: it ends at "summary", "plot".',
      'It is connected to nothing: using it reaches no start point, and nothing is ever shown on it.',
    ]);
  });

  it('sends a start point the data of each block that sends to it, by id, and fails by the name of a block that cannot say what it holds', async () => {
    const graph = tool();
    pageBlock(graph, 'file')!.value = 'notes.txt';
    const runtime = quietRuntime({ files: { read: async () => 'the notes' } });
    expect(await pageSends(graph, 'summarize', runtime)).toEqual({
      file: { path: 'notes.txt', content: 'the notes' }, length: 'long', note: 'a note',
    });
    expect(await pageSends(graph, 'api', runtime)).toEqual({});
    const broken = quietRuntime({ files: { read: async () => { throw new Error('no such file'); } } });
    await expect(pageSends(graph, 'summarize', broken)).rejects.toThrow('"File" could not say what it holds: no such file');
  });

  it('settles what a round hands back into the blocks that show each end point, and runs no code for a chart, a table or an image', async () => {
    const graph = parseGraph({
      nodes: [],
      page: { blocks: [{ id: 'chart', kind: 'plot_window', shows: 'points' }, { id: 'table', kind: 'table', shows: 'rows' }, { id: 'image', kind: 'image_view', shows: 'picture' }] },
    });
    const runtime = quietRuntime({
      files: { read: async (path) => `bytes of ${path}` },
      code: { run: async () => { throw new Error('no body runs for a block'); } },
    });
    const shown = await settlePage(graph, { points: [1, 2, 3], rows: 'Oslo', picture: 'cover.png' }, runtime);
    expect(shown).toEqual({ chart: [1, 2, 3], table: 'Oslo', image: 'data:image/png;base64,bytes of cover.png' });
    // What arrived and what is on the screen are told apart: an image's path is read into the picture.
    expect(pageBlock(graph, 'image')!.value).toBe('cover.png');
  });
});
