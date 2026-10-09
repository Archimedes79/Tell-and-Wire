import { describe, it, expect } from 'vitest';
import type { ExecutionResult, GraphNode, Wire } from '../../app/graph';
import { NODE_KINDS } from '../../app/document/nodeKinds';
import { inputFilesOf } from './exampleFile';

/**
 * The files ✨ Input writes a node's input definition from: the node's own --
 * examples, a spec -- and otherwise the one the graph hands a file-reading
 * input of it.
 */

/** A code node whose input `csv` reads the file at the path it is handed. */
function reader(config: Record<string, unknown> = {}): GraphNode {
  const node = NODE_KINDS.code.create('reader');
  return { ...node, inputs: [{ ...node.inputs[0], id: 'csv', name: 'csv', data_type: 'file_path' }], config: { ...node.config, ...config } };
}

/** A data node holding *path* in a field of that name, wired into the reader's `csv`. */
function typed(path: string): { nodes: GraphNode[]; edges: Wire[] } {
  const source = { ...NODE_KINDS.data.create('path'), config: { ...NODE_KINDS.data.create('path').config, data_value: { path } } };
  return { nodes: [source, reader()], edges: [{ source: 'path', sourceHandle: 'path', target: 'reader', targetHandle: 'csv' }] };
}

const ran = (inputs: Record<string, unknown>): ExecutionResult => ({
  status: 'success', outputs: {}, node_results: [{ node_id: 'reader', status: 'success', inputs, outputs: {} }],
} as ExecutionResult);

describe('the files ✨ Input writes from', () => {
  it('are the node\'s own, else the file the last run handed a file-reading input, else what is wired to it holds -- and none for an input that reads no file', () => {
    const { nodes, edges } = typed('data/typed.csv');
    expect(inputFilesOf(reader({ input_files: ['data/a.csv', 'spec.md'] }), nodes, edges, null)).toEqual(['data/a.csv', 'spec.md']);
    expect(inputFilesOf(reader(), nodes, edges, ran({ csv: ['data/ran.csv', 'data/second.csv'] }))).toEqual(['data/ran.csv']);
    expect(inputFilesOf(reader(), nodes, edges, null)).toEqual(['data/typed.csv']);
    expect(inputFilesOf(reader(), [], [], null)).toEqual([]);
    const words = { ...reader(), inputs: [{ ...reader().inputs[0], data_type: 'any' as const }] };
    expect(inputFilesOf(words, nodes, edges, null)).toEqual([]);
  });
});
