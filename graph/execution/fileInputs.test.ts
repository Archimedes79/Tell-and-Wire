import { describe, it, expect } from 'vitest';
import { readPorts } from './fileInputs.ts';
import { executeNode } from './executor.ts';
import { registry } from '../nodes/registry.ts';
import type { FileService, Runtime } from '../nodes/Runtime.ts';
import type { DataType, Graph, GraphNode, Port } from '../graph.ts';

/**
 * Which inputs are paths to be read, and who gets to say so: the port itself,
 * ticked "Read the file at this path" (typed `file_path`) -- nothing else.
 */

const port = (id: string, data_type: DataType): Port => ({
  id, name: id, kind: 'input', data_type, multi: false, required: false, description: '',
});

const node = (inputs: Port[]): GraphNode => ({
  id: 'code', node_type: 'code', label: 'Code', description: '',
  position: { x: 0, y: 0 }, inputs, outputs: [port('out', 'any')].map((p) => ({ ...p, kind: 'output' as const })),
  config: { code: 'function run(inputs) { return { out: inputs }; }' },
});

const files: FileService = {
  resolve: (path) => path, inProject: (path) => path, size: async () => 0, write: async () => {}, list: async () => [],
  read: async (path) => { if (!path) throw new Error("ENOENT: no such file or directory, open ''"); return `content of ${path}`; },
};

describe('a path that is read into its content', () => {
  /** A start point a file picker sends a path to, wired into both inputs of *reader*. */
  const graph = (reader: GraphNode): Graph => ({
    metadata: { name: 'Files' } as Graph['metadata'],
    nodes: [
      { id: 'pick', node_type: 'start', label: 'Pick', description: '', position: { x: 0, y: 0 }, inputs: [], outputs: [], config: {} },
      reader,
    ],
    edges: reader.inputs.map((input) => ({
      id: input.id, source_node_id: 'pick', source_port_id: 'data', target_node_id: 'code', target_port_id: input.id,
    })),
  });
  const runtime = (): Runtime => ({
    files,
    code: { run: async (_body, inputs) => ({ out: inputs }) },
    ai: { complete: async () => '' },
  });
  const handed = async (reader: GraphNode) => {
    const result = await executeNode(graph(reader), 'code', { file: 'a.csv', path: 'a.csv' }, { runtime: runtime(), registry });
    return result.outputs.out;
  };

  it('is read only on a port that says so itself -- whatever hands it a path, the wire does not decide', async () => {
    // A file reader takes the same picker output twice: once to be read, once
    // to keep the name for the line it prints about the file.
    expect(await handed(node([port('file', 'file_path'), port('path', 'text')]))).toEqual({ file: 'content of a.csv', path: 'a.csv' });
    expect(await handed(node([port('file', 'any'), port('path', 'any')]))).toEqual({ file: 'a.csv', path: 'a.csv' });

    // Every path of a list; no path (a picker nobody used) is no file.
    expect(await readPorts({ one: 'a.txt', many: ['b.txt', 'c.txt'], other: 'd.txt' }, ['one', 'many'], files))
      .toEqual({ one: 'content of a.txt', many: ['content of b.txt', 'content of c.txt'], other: 'd.txt' });
    expect(await readPorts({ one: '', blank: '   ' }, ['one', 'blank'], files)).toEqual({ one: '', blank: '' });
  });
});
