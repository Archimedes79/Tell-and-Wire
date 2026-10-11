import { describe, it, expect } from 'vitest';
import { parseGraph, type Graph } from '../../../graph/graph.ts';
import { guiBlock, guiSends, settleGui } from '../../../gui/gui.ts';
import { quietRuntime } from '../runtime/test/fakes.ts';

/**
 * The gui a graph is used through: blocks that connect themselves to the
 * graph's start and end points by name. Nothing is wired to a block; what a
 * round the gui starts is sent is made here, and what it hands back is
 * settled here.
 */

/** A gui for a summarizer: a file, a length, a Go button, the summary shown, a chart. */
const tool = (): Graph => parseGraph({
  metadata: { name: 'tool' },
  nodes: [
    { id: 'summarize', node_type: 'start', config: { started_by: 'gui' } },
    { id: 'api', node_type: 'start', config: { started_by: 'call' } },
    { id: 'summary', node_type: 'end', config: {} },
    { id: 'plot', node_type: 'end', config: {} },
  ],
  gui: {
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

describe('the gui, connected by name', () => {
  it('sends a start point the data of each block that sends to it, by id, and fails by the name of a block that cannot say what it holds', async () => {
    const graph = tool();
    guiBlock(graph, 'file')!.value = 'notes.txt';
    const runtime = quietRuntime({ files: { read: async () => 'the notes' } });
    expect(await guiSends(graph, 'summarize', runtime)).toEqual({
      file: { path: 'notes.txt', content: 'the notes' }, length: 'long', note: 'a note',
    });
    expect(await guiSends(graph, 'api', runtime)).toEqual({});
    const broken = quietRuntime({ files: { read: async () => { throw new Error('no such file'); } } });
    await expect(guiSends(graph, 'summarize', broken)).rejects.toThrow('"File" could not say what it holds: no such file');
  });

  it('settles what an end point handed back into the block that shows it -- a record as its keys, not as "[object Object]"', async () => {
    const graph = parseGraph({
      metadata: { name: 'chat' },
      nodes: [{ id: 'send', node_type: 'start', config: {} }, { id: 'reply', node_type: 'end', config: {} }],
      gui: { blocks: [{ id: 'chat', kind: 'chat', sends_to: ['send'], fires: 'send', shows: 'reply' }] },
    });
    guiBlock(graph, 'chat')!.value = { messages: [], pending: 'how many?' };
    await settleGui(graph, { reply: { words: 32, lines: 4 } }, quietRuntime());
    const said = (guiBlock(graph, 'chat')!.value as { messages: { role: string; text: string }[] }).messages;
    expect(said).toEqual([{ role: 'user', text: 'how many?' }, { role: 'assistant', text: 'words: 32\nlines: 4' }]);
  });
});
