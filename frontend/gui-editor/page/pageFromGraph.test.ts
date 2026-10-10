import { describe, it, expect } from 'vitest';
import type { GraphNode, Port, Wire } from '../../app/graph';
import { NODE_KINDS } from '../../app/document/nodeKinds';
import { pageFromGraph } from './pageFromGraph';

/**
 * A first page drawn from the graph: an input for each thing a start point
 * reads, a button that starts it, a text for each end point nobody shows --
 * and nothing for what the page already meets, or cannot start.
 */

const port = (id: string, extra: Partial<Port> = {}): Port => ({ id, name: id, kind: 'input', data_type: 'any', multi: false, required: false, description: '', ...extra });
const wire = (source: string, target: string, targetHandle: string): Wire => ({ source, sourceHandle: 'data', target, targetHandle });

const start = (id: string, startedBy: 'page' | 'call' | 'itself'): GraphNode => {
  const made = NODE_KINDS.start.create(id);
  return { ...made, label: id, config: { ...made.config, started_by: startedBy } };
};
const code = (id: string, inputs: Port[]): GraphNode => ({ ...NODE_KINDS.code.create(id), label: id, inputs });
// What a file's reader takes of a picked file: its content and its path, parts of one value -- and a length, a value of its own.
const summarize = code('summarize', [
  port('text', { field: 'file.content', data_type: 'text' }),
  port('name', { field: 'file.path', data_type: 'text' }),
  port('length', { field: 'length', data_type: 'text' }),
]);
// A node that reads the file itself takes a path, as it is.
const copy = code('copy', [port('from', { field: 'source', data_type: 'file_path' })]);
const answer = code('answer', [port('topic', { field: 'topic', data_type: 'text' })]);
const nodes = [start('read', 'page'), start('api', 'call'), start('clock', 'itself'), summarize, copy, answer, { ...NODE_KINDS.end.create('result'), label: 'Summary' }];
const edges = [
  wire('read', 'summarize', 'text'), wire('read', 'summarize', 'name'), wire('read', 'summarize', 'length'), wire('read', 'copy', 'from'),
  wire('api', 'answer', 'topic'), wire('clock', 'answer', 'topic'),
];

describe('a page drawn from the graph', () => {
  it('has an input for what each start point reads and one that starts it, a text for each end point, and asks before a start point a call starts is put on the page', () => {
    const planned = pageFromGraph(nodes, edges, []);
    // The page's start point: a picker for the file whose parts are read, a text box for the length, a picker for the path -- each sending under the name its input takes it by -- and a button to start it; then the end point shown.
    expect(planned.now.map((made) => [made.point.id, made.blocks.map((block) => [block.id, block.kind, block.label, block.send, block.sends_to, block.fires, block.shows])])).toEqual([
      ['read', [
        ['file', 'input_picker', 'File', undefined, ['read'], undefined, undefined],
        ['length', 'text_io', 'Length', undefined, ['read'], undefined, undefined],
        ['source', 'input_picker', 'Source', 'path', ['read'], undefined, undefined],
        ['button', 'button', 'read', undefined, undefined, 'read', undefined],
      ]],
      // A rule sets what comes back off from what is filled in.
      ['result', [
        ['divider', 'divider', '', undefined, undefined, undefined, undefined],
        ['text_io', 'text_io', 'Summary', undefined, undefined, undefined, 'result'],
      ]],
    ]);
    // A call starts the other: its blocks wait for the person's say. The clock's has none: the page cannot start it.
    expect(planned.ifSwitched.map((made) => [made.point.id, made.blocks.map((block) => [block.id, block.kind, block.sends_to, block.fires])])).toEqual([
      ['api', [['topic', 'text_io', ['api'], 'api']]],
    ]);

    // Sized so that a first page needs no resizing: inputs two to a row with the button beside the last, the one output across the row, in a raised box.
    const [inputs, outputs] = planned.now.map((made) => made.blocks);
    expect(inputs.map((block) => [block.id, block.w, block.h])).toEqual([['file', 8, 1], ['length', 8, 2], ['source', 12, 1], ['button', 4, 1]]);
    expect(outputs.map((block) => [block.kind, block.w, block.tone])).toEqual([['divider', 16, 'plain'], ['text_io', 16, 'raised']]);

    // What the page already meets is left as it is.
    const drawn = planned.now.flatMap((made) => made.blocks);
    expect(pageFromGraph(nodes, edges, drawn).now).toEqual([]);
  });
});
