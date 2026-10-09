import { describe, it, expect } from 'vitest';
import type { GraphNode, Port, Wire } from '../../app/graph';
import { NODE_KINDS } from '../../app/document/nodeKinds';
import { definitionExample, typedefProperties } from '../../../graph/authoring/definition.ts';
import { inputFile } from '../../../graph/authoring/pull.ts';
import { modelsBefore, pullable, pulledPorts } from './pull';

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
});
