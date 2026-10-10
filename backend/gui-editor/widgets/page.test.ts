import { describe, it, expect } from 'vitest';
import { parseGraph, type Graph } from '../../../graph/graph.ts';
import { completePage, pageBlock, pageSends } from './page.ts';
import { registry } from '../../../graph/nodes/registry.ts';
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

  it('completes a page a model wrote: what sends to a start point nothing fires fires it, and what is fired already is left as it is', () => {
    const written = (blocks: object[]) => parseGraph({
      metadata: { name: 'written' },
      nodes: [{ id: 'go', node_type: 'start', config: { started_by: 'page' } }, { id: 'api', node_type: 'start', config: { started_by: 'call' } }],
      page: { blocks },
    });
    const fires = (graph: Graph) => graph.page!.blocks.map((block) => block.fires ?? null);
    // A picker and a title: the picker fires, the title sends nothing and cannot.
    const model = written([{ id: 'title', kind: 'text', value: 'Chart' }, { id: 'file', kind: 'input_picker', sends_to: ['go'] }]);
    completePage(model, registry);
    expect(fires(model)).toEqual([null, 'go']);
    // Somebody fires it already -- a button, by the model's own choice -- and nothing more does.
    const chosen = written([{ id: 'file', kind: 'input_picker', sends_to: ['go'] }, { id: 'run', kind: 'button', fires: 'go' }]);
    completePage(chosen, registry);
    expect(fires(chosen)).toEqual([null, 'go']);
    // A call starts that start point, not the page: nothing to fire.
    const called = written([{ id: 'file', kind: 'input_picker', sends_to: ['api'] }]);
    completePage(called, registry);
    expect(fires(called)).toEqual([null]);
  });
});
