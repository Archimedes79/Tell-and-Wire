import { describe, it, expect } from 'vitest';
import { parseGraph } from '../../../graph/graph.ts';
import { registry } from '../../../graph/nodes/registry.ts';
import { completeGui } from '../../../gui/editor/complete.ts';
import { guiProblems } from '../../../gui/editor/gui.ts';

/** A GUI a model wrote with the blocks but not what they connect to: the points a person would have been given are made. */
describe('a GUI written whole', () => {
  it('gets the start and end points its blocks need, and is whole', () => {
    const graph = parseGraph({
      nodes: [{ id: 'shout', node_type: 'code', config: {} }],
      gui: { blocks: [
        { id: 'word', kind: 'text_io', label: 'Word', mode: 'input' },
        { id: 'loud', kind: 'text_io', label: 'Loud', mode: 'output' },
      ] },
    });
    completeGui(graph, registry);
    const [start, end] = [graph.nodes.find((n) => n.node_type === 'start'), graph.nodes.find((n) => n.node_type === 'end')];
    expect(start).toMatchObject({ id: 'start', config: { started_by: 'gui' } });
    expect(end).toMatchObject({ id: 'result', label: 'Loud' });
    expect(graph.gui!.blocks).toMatchObject([{ id: 'word', sends_to: ['start'], fires: 'start' }, { id: 'loud', shows: 'result' }]);
    expect(guiProblems(graph, registry)).toEqual([]);
  });

  it('makes the points a block names, keeps those that are there, and leaves a choice of several to the person', () => {
    const graph = parseGraph({
      nodes: [
        { id: 'a', node_type: 'start', config: { started_by: 'gui' } },
        { id: 'b', node_type: 'start', config: { started_by: 'gui' } },
        { id: 'done', node_type: 'end', config: {} },
      ],
      gui: { blocks: [
        { id: 'go', kind: 'button', label: 'Go', fires: 'begin' },
        { id: 'ask', kind: 'button', label: 'Ask', sends_to: ['a'] },
        { id: 'name', kind: 'text_io', mode: 'input', sends_to: ['a'], fires: 'a' },
        { id: 'free', kind: 'text_io', mode: 'input' },
        { id: 'one', kind: 'text_io', mode: 'output', shows: 'done' },
        { id: 'two', kind: 'text_io', mode: 'output', shows: 'answer', label: 'Answer' },
      ] },
    });
    completeGui(graph, registry);
    expect(graph.nodes.map((n) => n.id)).toEqual(['a', 'b', 'done', 'begin', 'answer']);
    // "a" and "b" are both started by the GUI: which one "free" sends to is for the person to say.
    expect(graph.gui!.blocks.find((block) => block.id === 'free')?.sends_to).toBeUndefined();
    expect(graph.gui!.blocks.find((block) => block.id === 'two')).toMatchObject({ shows: 'answer' });
    // A button holds nothing to send: it means to fire the start point it names.
    const ask = graph.gui!.blocks.find((block) => block.id === 'ask')!;
    expect([ask.fires, ask.sends_to]).toEqual(['a', undefined]);
  });
});
