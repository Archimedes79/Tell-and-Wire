import { describe, it, expect } from 'vitest';
import { parseGraph, type Graph } from '../graph.ts';
import { registry } from './registry.ts';
import { WIDGETS } from './widgets/roster.ts';
import {
  applyPageValues, clearDeliveredPage, firedBy, pageAuthorNote, pageBlock, pageProblems, pageReferencedPaths,
  pageRequirements, pageSends, pageState, parseWidget, sentBy, setPageState, settlePage, startFromPage,
  takesPageValue,
} from './page.ts';
import { quietRuntime } from '../../test/fakes.ts';

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

describe('reading a block', () => {
  it('takes who it is, how it is drawn and how it connects, and leaves the rest as its settings', () => {
    const widget = parseWidget({ id: 'b', kind: 'select', label: 'B', w: 6, tone: 'sunken', sends_to: ['x', ''], fires: 'x', options: 'a\nb' });
    expect(widget).toMatchObject({ id: 'b', kind: 'select', w: 6, h: 4, tone: 'sunken', sends_to: ['x'], fires: 'x', shows: null });
    expect(widget.config).toEqual({ options: 'a\nb' });
  });

  it('finds the blocks that fire and send to a point, by name', () => {
    const graph = tool();
    expect(firedBy(graph, 'summarize').map((widget) => widget.id)).toEqual(['length', 'go', 'note']);
    expect(sentBy(graph, 'summarize').map((widget) => widget.id)).toEqual(['file', 'length', 'note']);
  });
});

describe('what the page sends', () => {
  it('is the data of each block that sends to the start point, under the block\'s id', async () => {
    const graph = tool();
    pageBlock(graph, 'file')!.value = 'notes.txt';
    const runtime = quietRuntime({ files: { read: async () => 'the notes' } });
    expect(await pageSends(graph, 'summarize', runtime)).toEqual({
      file: { path: 'notes.txt', content: 'the notes' }, length: 'long', note: 'a note',
    });
    expect(await pageSends(graph, 'api', runtime)).toEqual({});
  });

  it('fails the round, by the block\'s name, when a block cannot say what it holds', async () => {
    const graph = tool();
    pageBlock(graph, 'file')!.value = 'gone.txt';
    const runtime = quietRuntime({ files: { read: async () => { throw new Error('no such file'); } } });
    await expect(pageSends(graph, 'summarize', runtime)).rejects.toThrow('"File" could not say what it holds: no such file');
  });

  it('starts each start point the page starts on what it holds, in a run of everything -- and no other', async () => {
    const graph = tool();
    await startFromPage(graph, quietRuntime(), registry);
    expect(graph.nodes[0].config).toMatchObject({ values: { file: null, length: 'long', note: 'a note' }, fired_by: 'page' });
    expect(graph.nodes[1].config.values).toBeUndefined();
  });
});

describe('what a person sets', () => {
  it('is kept where each block keeps it -- only by a block that takes a value', () => {
    const graph = tool();
    applyPageValues(graph, { length: 'short', title: 'written over', go: true, nobody: 1 });
    expect(pageBlock(graph, 'length')!.value).toBe('short');
    expect(pageBlock(graph, 'title')!.value).toBe('Summaries');
    expect(pageBlock(graph, 'go')!.value).toBeUndefined();
    expect(takesPageValue(graph, 'length')).toBe(true);
    expect(takesPageValue(graph, 'go')).toBe(false);
    expect(takesPageValue(graph, 'nobody')).toBe(false);
  });

  it('is the page\'s state, block by block, and goes back where it came from', () => {
    const graph = tool();
    const state = pageState(graph);
    // A heading, a button: their design and nothing else.
    expect(Object.keys(state)).toEqual(['file', 'length', 'shown', 'note', 'chart']);
    const other = tool();
    setPageState(other, { ...state, length: 'short', note: null });
    expect(pageBlock(other, 'length')!.value).toBe('short');
    expect(pageBlock(other, 'note')!.value).toBeUndefined();
  });

  it('is emptied once delivered when it was a message, and kept when it was a setting or changed meanwhile', () => {
    const graph = tool();
    const sent = pageState(graph);
    clearDeliveredPage(graph, sent);
    // The note fires the start point it sends to: a message, said once.
    expect(pageBlock(graph, 'note')!.value).toBe('');
    // The length fires too, but a choice is a setting.
    expect(pageBlock(graph, 'length')!.value).toBe('long');

    const typing = tool();
    const before = pageState(typing);
    pageBlock(typing, 'note')!.value = 'typed while it ran';
    clearDeliveredPage(typing, before);
    expect(pageBlock(typing, 'note')!.value).toBe('typed while it ran');
  });
});

describe('what a round hands back', () => {
  it('is settled into the blocks that show each end point, and said as each is drawn', async () => {
    const graph = tool();
    const shown = await settlePage(graph, { summary: 'It is short.' }, quietRuntime());
    expect(shown).toEqual({ shown: 'It is short.' });
    expect(pageBlock(graph, 'shown')!.value).toBe('It is short.');
    // The chart's end point handed back nothing: it is left as it was, and out.
    expect(pageBlock(graph, 'chart')!.value).toBeUndefined();
  });

  it('shows what arrives at a chart, a table or an image, and runs no code for any of them', async () => {
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

describe('what the page asks before a round', () => {
  it('is what the blocks that send to its start point ask, each under the block\'s id', () => {
    const graph = tool();
    expect(pageRequirements(graph, 'summarize')).toEqual([{ key: 'file', label: 'File', kind: 'file', current: '' }]);
    expect(pageRequirements(graph, 'api')).toEqual([]);
    expect(pageRequirements(graph, null)).toEqual([]);
  });

  it('names the files its blocks start on, for a bundle to carry', () => {
    const graph = tool();
    pageBlock(graph, 'file')!.value = 'data.csv';
    expect(pageReferencedPaths(graph)).toEqual(['data.csv']);
  });
});

describe('what is wrong with a page', () => {
  const problems = (blocks: Record<string, unknown>[]) => pageProblems(parseGraph({ ...tool(), page: { blocks } }), registry)
    .map((problem) => problem.problem);

  it('is nothing for a page that connects only to points the graph has, as each block can', () => {
    expect(pageProblems(tool(), registry)).toEqual([]);
  });

  it('names a block without an id, a second block of one id and a kind nobody knows', () => {
    expect(problems([{ kind: 'text' }, { id: 'a', kind: 'text' }, { id: 'a', kind: 'text' }, { id: 'b', kind: 'gauge' }, { id: 'go', kind: 'button', fires: 'summarize' }]))
      .toEqual(['A "text" block has no id.', 'More than one block has the id "a".', 'Unknown block kind "gauge".']);
  });

  it('names a block whose id is what a round says of a sender that is no block', () => {
    expect(problems([{ id: 'call', kind: 'button', fires: 'summarize' }]))
      .toEqual(['The id "call" is what a round no block started says started it: the first node could not tell the two apart.']);
  });

  it('names a connection to a point the graph does not have, or that the block cannot make', () => {
    expect(problems([
      { id: 'go', kind: 'button', fires: 'summarise' },
      { id: 'again', kind: 'button', fires: 'summarize' },
      { id: 'head', kind: 'text', fires: 'summarize' },
      { id: 'ring', kind: 'button', fires: 'api' },
      { id: 'pick', kind: 'input_picker', sends_to: ['nowhere'] },
      { id: 'sneak', kind: 'select', sends_to: ['api'] },
      { id: 'press', kind: 'button', sends_to: ['summarize'] },
      { id: 'out', kind: 'table', shows: 'nothing' },
      { id: 'box', kind: 'text_io', mode: 'input', shows: 'summary' },
    ])).toEqual([
      'It fires "summarise", which is no start point of the graph: it starts "summarize", "api".',
      'It fires "summarize", but using it is no event.',
      'It fires "api", which is not started by the page.',
      'It sends to "nowhere", which is no start point of the graph: it starts "summarize", "api".',
      'It sends to "api", which the page does not start: what it holds never reaches it.',
      'It sends to "summarize", but it holds nothing to send.',
      'It shows "nothing", which is no end point of the graph: it ends at "summary", "plot".',
      'It shows "summary", but it shows nothing.',
    ]);
  });

  it('names a block connected to nothing: using it would reach nothing, and nothing would be shown on it', () => {
    expect(problems([{ id: 'go', kind: 'button', fires: 'summarize' }, { id: 'loose', kind: 'select', options: 'a' }, { id: 'head', kind: 'text' }]))
      .toEqual(['It is connected to nothing: using it reaches no start point, and nothing is ever shown on it.']);
  });

  it('names a value a node takes of what the page sends that no block sends: it would never arrive', () => {
    const graph = tool();
    graph.nodes.push(parseGraph({
      nodes: [{ id: 'read', node_type: 'code', inputs: [{ id: 'text', name: 'text', field: 'file.content' }, { id: 'size', name: 'size', field: 'lenght' }] }],
    }).nodes[0]);
    graph.edges.push(
      { id: 'a', source_node_id: 'summarize', source_port_id: 'data', target_node_id: 'read', target_port_id: 'text' },
      { id: 'b', source_node_id: 'summarize', source_port_id: 'data', target_node_id: 'read', target_port_id: 'size' },
    );
    expect(pageProblems(graph, registry)).toEqual([{
      where: 'node "read", input "size"',
      problem: 'It takes "lenght" of what "summarize" is sent, and no block of the page sends "lenght" to it: it is sent "file", "length", "note".',
      fix: 'Take one of what it is sent, or let the block "lenght" send to "summarize".',
    }]);
  });

  it('names a start point the page starts that nothing on the page fires: nobody could start it', () => {
    expect(pageProblems(parseGraph({ ...tool(), page: { blocks: [{ id: 'chart', kind: 'plot_window', shows: 'plot' }] } }), registry)).toEqual([{
      where: 'start point "summarize"',
      problem: 'It is started by the page, and nothing on the page fires it.',
      fix: 'Let a button, a box or a choice fire "summarize", or have it started by a call or by itself.',
    }]);
  });
});

describe('the page, for the model that designs a graph', () => {
  it('says how a block connects, and lists every kind there is', () => {
    const note = pageAuthorNote();
    expect(note).toContain('"sends_to"');
    expect(note).toContain('"fires"');
    expect(note).toContain('"shows"');
    for (const element of WIDGETS) expect(note).toContain(`  - ${element.widgetKind}`);
  });
});
