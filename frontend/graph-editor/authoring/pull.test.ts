import { describe, it, expect } from 'vitest';
import type { GraphNode, Port, Wire } from '../../app/graph';
import { NODE_KINDS } from '../../app/document/nodeKinds';
import { definitionExample, typedefProperties } from '../../../graph/authoring/definition.ts';
import { inputFile, outputFile } from '../../../graph/authoring/pull.ts';
import { modelsBefore, pullGap, pullable, pullableOutput, pulledOutputs, pulledPorts } from './pull';

/**
 * Pull: input.js read off the graph -- the type from the output.js of the node
 * before it, the example from a run of what is before it.
 */

const OUTPUT = `/**
 * @typedef {Object} Output
 * @property {string} text  the file's text, unchanged
 * @property {number} count  how many words it has
 */
module.exports = { "text": "one two", "count": 2 };`;

const port = (id: string, extra: Partial<Port> = {}): Port => ({ id, name: id, kind: 'input', data_type: 'any', multi: false, required: false, description: '', ...extra });
const wire = (source: string, sourceHandle: string, target: string, targetHandle: string): Wire => ({ source, sourceHandle, target, targetHandle });

const writer = NODE_KINDS.ai.create('writer');
const reader: GraphNode = { ...NODE_KINDS.code.create('reader'), config: { ...NODE_KINDS.code.create('reader').config, output_definition: OUTPUT } };
const counter: GraphNode = { ...NODE_KINDS.code.create('counter'), inputs: [port('text'), port('spare')] };
const nodes = [writer, reader, counter];
const edges = [wire('writer', 'output', 'reader', 'input'), wire('reader', 'text', 'counter', 'text')];

describe('pulling an input', () => {
  it('is typed by the output.js of the node before it, shown an example of a run of what is before it, and says where a model is asked', () => {
    expect(pullable(counter, edges)).toBe(true);
    expect(pullable({ ...counter, inputs: [port('spare')] }, edges)).toBe(false);
    expect(modelsBefore(counter, nodes, edges).map((one) => one.id)).toEqual(['writer']);
    // What a loop brings back is not before it: the model that writes the memory after the node is asked after it.
    const keep: GraphNode = { ...NODE_KINDS.data.create('keep'), config: { ...NODE_KINDS.data.create('keep').config, data_value: { n: 0 } }, inputs: [port('n')], outputs: [port('n', { kind: 'output' })] };
    const step: GraphNode = { ...NODE_KINDS.code.create('step'), inputs: [port('in')] };
    const loop = [wire('keep', 'n', 'step', 'in'), wire('step', 'output', 'writer', 'input'), wire('writer', 'output', 'keep', 'n')];
    expect(modelsBefore(step, [keep, step, writer], loop)).toEqual([]);

    const ran = pulledPorts(counter, nodes, edges, { inputs: { text: 'Real text of the run.' }, texts: {} });
    expect(ran).toMatchObject([
      { id: 'text', type: 'string', description: 'the file\'s text, unchanged', example: 'Real text of the run.' },
      { id: 'spare', type: '*', example: undefined },
    ]);
    // The file says it in the form every definition has: JSDoc, then one example as plain JSON.
    const file = inputFile(ran);
    expect(typedefProperties(file, 'Input').map((one) => [one.id, one.type])).toEqual([['text', 'string'], ['spare', '*']]);
    expect(definitionExample(file)).toEqual({ example: { text: 'Real text of the run.', spare: null } });

    // Without a run, the example the node before it states stands in for it.
    expect(pulledPorts(counter, nodes, edges, { inputs: {}, texts: {} })[0].example).toBe('one two');
    // One call of a node that runs per item is handed one item of the list that arrives.
    const each: GraphNode = { ...counter, inputs: [port('text', { multi: true })], config: { ...counter.config, batch_mode: 'per_item' } };
    expect(pulledPorts(each, nodes, edges, { inputs: { text: ['first', 'second'] }, texts: {} })[0]).toMatchObject({ type: 'string', example: 'first' });
  });

  it('reads a memory as it looks filled, and the outputs written into one off its fields -- where every output is -- with no model', () => {
    const keep = { ...NODE_KINDS.data.create('keep'), label: 'Totals', config: { ...NODE_KINDS.data.create('keep').config, data_value: { total: 0, names: [] }, data_example: { total: 42, names: ['Ada'] } } };
    const adder: GraphNode = { ...NODE_KINDS.code.create('adder'), outputs: [port('next', { kind: 'output' }), port('who', { kind: 'output' })] };
    const into = [wire('adder', 'next', 'keep', 'total'), wire('adder', 'who', 'keep', 'names')];
    const written = pulledOutputs(adder, [adder, keep], into);
    expect(written).toMatchObject([{ id: 'next', type: 'number', example: 42 }, { id: 'who', type: 'Array<string>', example: ['Ada'] }]);
    expect(typedefProperties(outputFile(written!), 'Output').map((one) => [one.id, one.type])).toEqual([['next', 'number'], ['who', 'Array<string>']]);
    expect(pullableOutput(adder, [adder, keep], into)).toBe(true);
    // One output that goes elsewhere is for the chat to say.
    expect(pullableOutput(adder, [adder, keep], into.slice(0, 1))).toBe(false);

    // What reads a field is shown it filled; a run only shows how it starts.
    const reader: GraphNode = { ...NODE_KINDS.code.create('reader'), inputs: [port('total')] };
    expect(pulledPorts(reader, [keep, reader], [wire('keep', 'total', 'reader', 'total')], { inputs: { total: 0 }, texts: {} })[0]).toMatchObject({ type: 'number', example: 42 });

    // What a pull could not find is said, and stops what would be written after it.
    const bare = pulledPorts(counter, nodes, edges, { inputs: {}, texts: {} }).map((one) => ({ ...one, example: undefined }));
    expect(pullGap(counter, bare, edges, { inputs: {}, texts: {}, unread: [], error: null })).toMatch(/no example for "text"/);
    expect(pullGap(counter, bare, edges, { inputs: {}, texts: {}, unread: [], error: 'boom' })).toBe('there is no example from a run: boom');
  });
});
