import { describe, it, expect } from 'vitest';
import { parseGraph } from '../../../graph/graph.ts';
import { registry } from '../../../graph/nodes/registry.ts';
import { completeGui } from '../../../gui/editor/complete.ts';
import { guiProblems } from '../../../gui/authoring/gui.ts';
import { problemsIn } from '../../../gui/authoring/check.ts';

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

  it('wires an input that takes a part of the start package from the start point, where a model wired the gate and forgot the input', () => {
    const graph = parseGraph({
      nodes: [
        { id: 'go', node_type: 'start', config: { started_by: 'gui' } },
        { id: 'sum', node_type: 'ai', inputs: [{ id: 'text', name: 'Text', kind: 'input', data_type: 'text', multi: false, required: false, field: 'file.content' }], outputs: [] },
      ],
      edges: [{ id: 'g', source_node_id: 'go', source_port_id: 'data', target_node_id: 'sum', target_port_id: '__run' }],
    });
    completeGui(graph, registry);
    expect(graph.edges.map((edge) => `${edge.source_node_id}.${edge.source_port_id} -> ${edge.target_node_id}.${edge.target_port_id}`)).toEqual(['go.data -> sum.__run', 'go.data -> sum.text']);
  });

  it('types an input that takes the paths a file or folder block sends as paths to read -- a model that names the field forgets the type, and is then sent the names, not the text', () => {
    const graph = parseGraph({
      nodes: [
        { id: 'go', node_type: 'start', config: { started_by: 'gui' } },
        { id: 'each', node_type: 'ai', inputs: [{ id: 'file', name: 'File', kind: 'input', data_type: 'text', multi: true, required: false, field: 'folder' }, { id: 'note', name: 'Note', kind: 'input', data_type: 'text', multi: false, required: false, field: 'word' }, { id: 'many', name: 'Many', kind: 'input', data_type: 'text', multi: false, required: false, field: 'folder.files' }], outputs: [] },
      ],
      edges: [
        { id: 'a', source_node_id: 'go', source_port_id: 'data', target_node_id: 'each', target_port_id: 'file' },
        { id: 'b', source_node_id: 'go', source_port_id: 'data', target_node_id: 'each', target_port_id: 'note' },
        { id: 'c', source_node_id: 'go', source_port_id: 'data', target_node_id: 'each', target_port_id: 'many' },
      ],
      gui: { blocks: [
        { id: 'folder', kind: 'input_picker', mode: 'directory', label: 'Folder', sends_to: ['go'] },
        { id: 'word', kind: 'text_io', mode: 'input', label: 'Word', sends_to: ['go'] },
      ] },
    });
    // Left as it was written, the check says it in plain words; completed, there is nothing to say.
    expect(problemsIn(graph).map((one) => one.plain ?? '').filter((said) => /names of the files/.test(said))).toEqual([expect.stringMatching(/only given the names of the files.*Read the file at this path/)]);
    completeGui(graph, registry);
    expect(problemsIn(graph).filter((one) => /names of the files/.test(one.plain ?? ''))).toEqual([]);
    const types = Object.fromEntries(graph.nodes.find((one) => one.id === 'each')!.inputs.map((port) => [port.id, port.data_type]));
    // A part the folder does not send ("folder.files") is what it does send: its paths, whole, under its id.
    expect(types).toEqual({ file: 'file_path', note: 'text', many: 'file_path' });
    expect(graph.nodes.find((one) => one.id === 'each')!.inputs.find((port) => port.id === 'many')!.field).toBe('folder');
    // The files of a folder are items: the node is asked to run once for each, and hands on the list of what it made.
    const each = graph.nodes.find((one) => one.id === 'each')!;
    expect([each.config.batch_mode, each.inputs.find((port) => port.id === 'file')!.multi]).toEqual(['per_item', true]);
  });
});

describe('a graph a model wired by naming outputs', () => {
  it('wires an input whose field names another node\'s output from that output -- not from the start point, which then hands it the whole tool\'s package', () => {
    const graph = parseGraph({
      nodes: [
        { id: 'go', node_type: 'start', config: { started_by: 'gui' } },
        { id: 'read', node_type: 'ai', outputs: [{ id: 'amount', name: 'Amount', kind: 'output', data_type: 'number', multi: true, required: false, description: '' }], inputs: [] },
        { id: 'sum', node_type: 'code', inputs: [{ id: 'amounts', name: 'Amounts', kind: 'input', data_type: 'number', multi: false, required: false, field: 'read.amount' }], outputs: [] },
      ],
    });
    completeGui(graph, registry);
    expect(graph.edges.map((edge) => `${edge.source_node_id}.${edge.source_port_id} -> ${edge.target_node_id}.${edge.target_port_id}`)).toEqual(['read.amount -> sum.amounts']);
    expect(graph.nodes.find((one) => one.id === 'sum')!.inputs[0].field).toBeUndefined();
  });

  it('points a wire at the port it means where a model named it in the singular and declared it in the plural -- and leaves one that could mean two', () => {
    const port = (id: string, kind: 'input' | 'output') => ({ id, name: id, kind, data_type: 'any', multi: false, required: false, description: '' });
    const graph = parseGraph({
      nodes: [
        { id: 'read', node_type: 'ai', inputs: [], outputs: [port('category', 'output'), port('urgency', 'output')] },
        { id: 'count', node_type: 'code', inputs: [port('categories', 'input'), port('urgencies', 'input'), port('note', 'input'), port('notes', 'input')], outputs: [] },
      ],
      edges: [
        { id: 'e1', source_node_id: 'read', source_port_id: 'categories', target_node_id: 'count', target_port_id: 'category' },
        { id: 'e2', source_node_id: 'read', source_port_id: 'urgency', target_node_id: 'count', target_port_id: 'urgency' },
        { id: 'e3', source_node_id: 'read', source_port_id: 'urgency', target_node_id: 'count', target_port_id: 'Notes' },
      ],
    });
    completeGui(graph, registry);
    expect(graph.edges.map((edge) => `${edge.source_port_id} -> ${edge.target_port_id}`)).toEqual(['category -> categories', 'urgency -> urgencies', 'urgency -> Notes']);
  });
});
