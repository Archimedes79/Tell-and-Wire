import { describe, it, expect } from 'vitest';
import { parseGraph, type Graph } from '../../../graph/graph.ts';
import { pageBlock, pageSends } from './page.ts';
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
});
