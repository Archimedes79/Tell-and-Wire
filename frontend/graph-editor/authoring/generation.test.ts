import { describe, it, expect } from 'vitest';
import type { GraphNode, Port } from '../../app/graph';
import { NODE_KINDS } from '../../app/document/nodeKinds';
import { generateRequest, outputsFrom, partsOf, writesFor, writtenInto } from './generation';

/**
 * What a node's ✨ asks and what it writes in: the request built in one place
 * for the panel, the sweep and "what ✨ sends", and the answer written into
 * the node by one pure function.
 */

/** A new node of *type*, with *config* set on top of what it starts with. */
function made(type: 'code' | 'ai' | 'data', config: Record<string, unknown> = {}, inputs?: Port[]): GraphNode {
  const node = NODE_KINDS[type].create(type);
  return { ...node, inputs: inputs ?? node.inputs, config: { ...node.config, ...config } };
}

const INPUT = 'module.exports = { "input": "a" };';
const OUTPUT = 'module.exports = { "output": 1 };';
const answer = (result: string, description?: string) => ({ result, calls: [], ...(description === undefined ? {} : { description }) });
const around = (node: GraphNode) => ({ nodes: [node], edges: [], metadata: { name: 'Words', description: '', gui_scheme: 'night' } as never, page: [] });

describe('what one press of ✨ writes', () => {
  it('is, for the body, what is missing first -- input.js where it takes something in, output.js -- so one press does the whole node; for ✨ Generate, every file again once the body is there', () => {
    expect(writesFor(made('code'), 'body')).toEqual(['input', 'output', 'body']);
    expect(writesFor(made('code', { input_definition: INPUT }), 'body')).toEqual(['output', 'body']);
    expect(writesFor(made('code', { input_definition: INPUT, output_definition: OUTPUT }), 'body')).toEqual(['body']);
    expect(writesFor(made('code', {}, []), 'body')).toEqual(['output', 'body']);
    // A stub is nothing written; ✨ Input and a data node, which has no definitions, write only themselves.
    expect(writesFor(made('ai', { input_definition: 'module.exports = null;' }), 'body')).toEqual(['input', 'output', 'body']);
    expect(writesFor(made('code'), 'input')).toEqual(['input']);
    expect(writesFor(made('data'), 'body')).toEqual(['body']);

    expect(writesFor(made('code'), 'all')).toEqual(['input', 'output', 'body']);
    const whole = made('code', { input_definition: INPUT, output_definition: OUTPUT, code: 'function run() { return { output: 1 }; }' });
    expect(writesFor(whole, 'all')).toEqual(['input', 'output', 'body']);
    expect(writesFor({ ...whole, inputs: [] }, 'all')).toEqual(['output', 'body']);
    expect(writesFor(made('data'), 'all')).toEqual(['body']);
  });
});

describe('what ✨ sends', () => {
  it('is the node without its history, the graph around it, what it is wired to -- and the files each ✨ is given', () => {
    const node = { ...made('code', { history: '## old', input_files: ['data/a.csv'], output_files: ['spec.md'] }), description: 'Count.' };
    const input = generateRequest(node, 'input', around(node), ['data/a.csv', 'data/b.csv']);
    expect(input.node.config.history).toBeUndefined();
    expect(input.context).toContain('Graph: Words');
    expect(input.input_files).toEqual([{ path: 'data/a.csv' }, { path: 'data/b.csv' }]);
    expect(input.output_files).toBeUndefined();
    const output = generateRequest(node, 'output', around(node), ['data/a.csv']);
    expect(output.output_files).toEqual([{ path: 'spec.md' }]);
    expect(output.input_files).toBeUndefined();
    const body = generateRequest(node, 'body', around(node), ['data/a.csv'], { refine: { change: 'shout' } });
    expect(body).toMatchObject({ write: 'body', refine: { change: 'shout' }, input_sources: {}, output_targets: {} });
    expect(body.input_files).toBeUndefined();
    // What was said to a chat for a file not written yet goes with it, trimmed.
    expect(generateRequest(node, 'output', around(node), [], { ask: '  also the words ' }).ask).toBe('also the words');
  });
});

describe('what comes back, written in', () => {
  const at = new Date(2026, 8, 28, 9, 30);

  it('is the file ✨ wrote, and the exchange at the end of history.md', () => {
    const node = made('code');
    const input = writtenInto(node, 'input', answer(INPUT), '✨ Input', at);
    expect(input.config.input_definition).toBe(INPUT);
    expect(input.config.history).toBe('## 2026-09-28 09:30 · ✨ Input\n\nNothing was sent.');
    expect(input.outputs).toBe(node.outputs);
    expect(writtenInto(node, 'body', answer('function run() { return { output: 1 }; }'), '✨ Code', at).config.code)
      .toBe('function run() { return { output: 1 }; }');
  });

  it('writes the output.js a changed body came back with together with it, as one step: its keys are the outputs', () => {
    const node = { ...made('code', { input_definition: INPUT, output_definition: OUTPUT, code: 'function run() { return { output: 1 }; }' }), description: 'Count.' };
    const figure = 'module.exports = { "figure": { "kind": "bars", "points": [] }, "count": 2 };';
    const changed = writtenInto(node, 'body', { result: 'function run() { return { figure: {}, count: 2 }; }', output_definition: figure, description: 'Counts, as a figure.', calls: [] }, 'Change: a figure', at);
    expect(changed.config).toMatchObject({ code: 'function run() { return { figure: {}, count: 2 }; }', output_definition: figure });
    expect(changed.outputs.map((port) => port.id)).toEqual(['figure', 'count']);
    expect(changed.description).toBe('Counts, as a figure.');
    expect(changed.config.history).toMatch(/^## 2026-09-28 09:30 · Change: a figure/);
    // Without one, output.js and the outputs stay as they were.
    const kept = writtenInto(node, 'body', answer('function run() { return { output: 2 }; }'), '✨ Code', at);
    expect(kept.config.output_definition).toBe(OUTPUT);
    expect(kept.outputs).toBe(node.outputs);
  });

  it('is the fields a data node was written as -- JSON that is no object is one field -- and its ports follow them', () => {
    const written = writtenInto(made('data'), 'body', { ...answer('{ "recent": [], "seen": 0 }'), example: '{ "recent": ["a"], "seen": 3 }' }, '✨ Fields', at);
    expect(written.config.data_value).toEqual({ recent: [], seen: 0 });
    expect(written.inputs.map((port) => port.id)).toEqual(['recent', 'seen']);
    expect(written.outputs.map((port) => port.id)).toEqual(['recent', 'seen', 'round', 'all', 'before']);
    // Its example is written with them -- and gone with an answer that brought none: one of other fields would be written against.
    expect(written.config.data_example).toEqual({ recent: ['a'], seen: 3 });
    expect(partsOf(written)).toEqual(['body', 'example']);
    expect(writtenInto(written, 'body', answer('{ "seen": 0 }'), '✨ Fields', at).config.data_example).toBeUndefined();
    expect(writtenInto(made('data'), 'body', answer('[1, 2]'), '✨ Fields', at).config.data_value).toEqual({ value: [1, 2] });
  });
});

describe('the outputs an output definition names', () => {
  const port = (id: string, extra: Partial<Port> = {}): Port => ({ id, name: id.toUpperCase(), kind: 'output', data_type: 'text', multi: false, required: false, description: 'kept', ...extra });

  it('keeps a port that is there as it is, types a new one by its example, and keeps the error port last', () => {
    const node = { ...made('code', {}, []), outputs: [port('summary'), port('error')] };
    const outputs = outputsFrom(node, 'module.exports = { "flag": true, "summary": "s", "parts": { "a": 1 } };');
    expect(outputs.map((one) => [one.id, one.data_type, one.name])).toEqual([
      ['flag', 'boolean', 'flag'], ['summary', 'text', 'SUMMARY'], ['parts', 'json', 'parts'], ['error', 'text', 'ERROR'],
    ]);
  });
});
