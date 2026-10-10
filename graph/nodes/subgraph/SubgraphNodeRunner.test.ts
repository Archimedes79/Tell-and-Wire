import { describe, it, expect } from 'vitest';
import { executeGraph } from '../../execution/executor.ts';
import { registry } from '../registry.ts';
import { parseGraph, type Graph, type GraphEdge, type GraphNode } from '../../graph.ts';
import type { Runtime } from '../Runtime.ts';
import { edge, quietRuntime } from '../../test/fakes.ts';

/**
 * A graph inside a node, run by the executor that runs every graph.
 *
 * Every test here goes through `executeGraph`, never through the element on
 * its own: the point of the design is that the outer run and the inner run are
 * the same code, and a test that called `execute` directly would be testing
 * something no run does.
 */

const port = (id: string, kind: 'input' | 'output') =>
  ({ id, name: id, kind, data_type: 'any' as const, multi: false, required: false, description: '' });

function node(id: string, type: string, config: Record<string, unknown> = {}, ports: {
  inputs?: string[]; outputs?: string[];
} = {}): GraphNode {
  return {
    id, node_type: type as GraphNode['node_type'], label: id, description: '',
    position: { x: 0, y: 0 },
    inputs: (ports.inputs ?? []).map((p) => port(p, 'input')),
    outputs: (ports.outputs ?? []).map((p) => port(p, 'output')),
    config,
  };
}

function graph(nodes: GraphNode[], edges: GraphEdge[] = []): Graph {
  return parseGraph({ metadata: { name: 'test' }, nodes, edges });
}

/** Shouts the text it is given, so a value that crossed the boundary is visible. */
const shouting = quietRuntime({
  files: { read: async (path: string) => `contents of ${path}` },
  code: { run: async (_body, inputs) => ({ output: String(inputs.value ?? '').toUpperCase() }) },
});

/** *at* with its input *port* taking *field* of the package a start point hands on. */
const taking = (at: GraphNode, port: string, field: string): GraphNode =>
  ({ ...at, inputs: at.inputs.map((one) => (one.id === port ? { ...one, field } : one)) });

/**
 * The inner graph: a start point the graph above starts, one code node that
 * takes what it is sent under the start point's name, one end point. Run on
 * its own, the start point hands on what its design says it was sent.
 */
function inner(): unknown {
  return {
    metadata: { name: 'inside' },
    nodes: [
      node('subject', 'start', { started_by: 'call', values: { subject: 'from inside' } }),
      taking(node('shout', 'code', { code: 'x', language: 'js' }, { inputs: ['value'], outputs: ['output'] }), 'value', 'subject'),
      node('loud', 'end', {}, { inputs: ['value'] }),
    ],
    edges: [
      edge('a', 'subject', 'data', 'shout', 'value'),
      edge('b', 'shout', 'output', 'loud', 'value'),
    ],
  };
}

const holder = (config: Record<string, unknown> = {}) =>
  node('part', 'subgraph', { subgraph: inner(), ...config });

describe('a node that holds a graph', () => {
  it('has its start points and end points for ports, sends what arrived on a port to the start point of that name, and leaves the graph as it found it', async () => {
    // A node that is no way in -- data -- is no port, and neither is a start
    // point that starts itself, whatever it reads: nobody above can start it.
    const held = inner() as { nodes: GraphNode[] };
    held.nodes.push(node('kept', 'data', { data_value: { x: 1 } }));
    held.nodes.push(node('ticks', 'start', { started_by: 'itself', every: '5m', reads: 'folder', path: 'docs' }));
    const ports = registry.node('subgraph')!.derivedPorts(node('part', 'subgraph', { subgraph: held }), registry)!;
    expect(ports.inputs.map((p) => p.id)).toEqual(['subject']);
    expect(ports.outputs.map((p) => p.id)).toEqual(['loud']);

    const part = holder();
    const before = JSON.stringify(part.config.subgraph);
    const outer = graph([
      node('source', 'data', { data_value: { value: 'from outside' } }),
      part,
      node('show', 'end', {}, { inputs: ['value'] }),
    ], [
      edge('in', 'source', 'value', 'part', 'subject'),
      edge('out', 'part', 'loud', 'show', 'value'),
    ]);
    const result = await executeGraph(outer, { runtime: shouting, registry });
    expect(result.status).toBe('success');
    expect(result.node_results.find((r) => r.node_id === 'part')?.outputs).toEqual({ loud: 'FROM OUTSIDE' });
    expect(JSON.stringify(part.config.subgraph)).toBe(before);
  });

  it('runs the graph inside once per item where it is set to: a list in, one result per item out', async () => {
    // What nested_statistics does for one paragraph, done for each of a list of them.
    const listing: Runtime = {
      ...shouting,
      code: { run: async (_body, inputs) => ('value' in inputs ? { output: String(inputs.value).toUpperCase() } : { output: ['one', 'two', 'three'] }) },
    };
    const run = async (part: GraphNode) => {
      const outer = graph([node('paragraphs', 'code', { code: 'x' }, { outputs: ['output'] }), part, node('show', 'end', {}, { inputs: ['value'] })],
        [edge('in', 'paragraphs', 'output', 'part', 'subject'), edge('out', 'part', 'loud', 'show', 'value')]);
      const result = await executeGraph(outer, { runtime: listing, registry });
      expect(result.status).toBe('success');
      return result.node_results.find((r) => r.node_id === 'part')?.outputs;
    };
    const each = { ...holder({ batch_mode: 'per_item' }), inputs: [{ ...port('subject', 'input'), multi: true }] };
    expect(await run(each)).toEqual({ loud: ['ONE', 'TWO', 'THREE'] });
    // Not set to: one run, on the whole list.
    expect(await run(holder())).toEqual({ loud: 'ONE,TWO,THREE' });
  });

  it('fails with the inner node named and the outer one, and stops when the run is stopped, down to the graph inside', async () => {
    const breaking: Runtime = { ...shouting, code: { run: async () => { throw new Error('the body blew up'); } } };
    const result = await executeGraph(graph([holder()]), { runtime: breaking, registry });
    expect(result.status).toBe('error');
    const failed = result.node_results.find((r) => r.node_id === 'part')!;
    expect(failed.status).toBe('error');
    expect(failed.error).toMatch(/Inside "part"/);
    expect(failed.error).toMatch(/code node "shout" failed: the body blew up/);

    const stop = new AbortController();
    const slow: Runtime = {
      ...shouting,
      code: {
        run: (_body, _inputs, signal) => new Promise((_done, fail) => {
          signal?.addEventListener('abort', () => fail(new Error('Stopped.')), { once: true });
        }),
      },
    };
    const running = executeGraph(graph([holder()]), { runtime: slow, registry, signal: stop.signal });
    setTimeout(() => stop.abort(), 50);
    expect((await running).status).toBe('cancelled');
  });
});
