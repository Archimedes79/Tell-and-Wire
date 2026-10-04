import { describe, it, expect } from 'vitest';
import { executeGraph } from '../../../execution/executor.ts';
import { registry } from '../../registry.ts';
import { parseGraph, type Graph, type GraphEdge, type GraphNode } from '../../../graph.ts';
import type { Runtime } from '../../Runtime.ts';
import { bundleNeeds } from '../../../cli/bundle.ts';
import { edge, quietRuntime } from '../../../../test/fakes.ts';

/**
 * A graph inside a node, run by the engine that runs graphs.
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
  it('has the graph inside it as its ports', () => {
    const element = registry.node('subgraph')!;
    const ports = element.derivedPorts(holder(), registry)!;
    expect(ports.inputs.map((p) => p.id)).toEqual(['subject']);
    expect(ports.outputs.map((p) => p.id)).toEqual(['loud']);
  });

  it('runs the graph inside and hands its output on', async () => {
    const outer = graph([holder(), node('show', 'end', {}, { inputs: ['value'] })],
      [edge('out', 'part', 'loud', 'show', 'value')]);

    const result = await executeGraph(outer, { runtime: shouting, registry });

    expect(result.status).toBe('success');
    // Nothing was wired in, so the start point inside handed on its design's.
    expect(result.node_results.find((r) => r.node_id === 'part')?.outputs).toEqual({ loud: 'FROM INSIDE' });
  });

  it('sends what arrived on a port to the start point of that name, under its name, as the graph above', async () => {
    const outer = graph([
      node('source', 'data', { data_value: 'from outside' }, { outputs: ['output'] }),
      holder(),
      node('show', 'end', {}, { inputs: ['value'] }),
    ], [
      edge('in', 'source', 'output', 'part', 'subject'),
      edge('out', 'part', 'loud', 'show', 'value'),
    ]);

    const result = await executeGraph(outer, { runtime: shouting, registry });
    expect(result.node_results.find((r) => r.node_id === 'part')?.outputs).toEqual({ loud: 'FROM OUTSIDE' });
  });

  it('has only its start points and end points for ports: there is one kind of way in and out', () => {
    // A node that is no way in -- data, a folder listing -- is no port, and
    // neither is a start point that starts itself: nobody above can start it.
    const held = inner() as { nodes: GraphNode[] };
    held.nodes.push(node('kept', 'data', { data_value: 'x' }, { outputs: ['output'] }));
    held.nodes.push(node('listed', 'folder', { path: 'docs' }));
    held.nodes.push(node('ticks', 'start', { started_by: 'itself', every: '5m' }));
    const ports = registry.node('subgraph')!.derivedPorts(node('part', 'subgraph', { subgraph: held }), registry)!;
    expect(ports.inputs.map((p) => p.id)).toEqual(['subject']);
    expect(ports.outputs.map((p) => p.id)).toEqual(['loud']);
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
    // Its ports say so: the input it runs over is a list, and so is what it hands on.
    const ports = registry.node('subgraph')!.derivedPorts(each, registry)!;
    expect([ports.inputs[0].multi, ports.outputs[0].multi]).toEqual([true, true]);
    // Not set to: one run, on the whole list.
    expect(await run(holder())).toEqual({ loud: 'ONE,TWO,THREE' });
  });

  it('carries a value the boundary cannot spell as text', async () => {
    // A port is not a text field: what the wire carries is what arrives inside.
    const passing: Runtime = { ...shouting, code: { run: async (_b, inputs) => ({ output: inputs.value }) } };
    const outer = graph([
      node('make', 'code', { code: 'x' }, { outputs: ['output'] }),
      holder(),
    ], [edge('in', 'make', 'output', 'part', 'subject')]);
    const objects: Runtime = {
      ...passing,
      code: {
        run: async (_body, inputs) => ('value' in inputs ? { output: inputs.value } : { output: { rows: [1, 2, 3] } }),
      },
    };

    const result = await executeGraph(outer, { runtime: objects, registry });
    expect(result.node_results.find((r) => r.node_id === 'part')?.outputs).toEqual({ loud: { rows: [1, 2, 3] } });
  });

  it('leaves the graph it holds exactly as it found it', async () => {
    const held = holder();
    const before = JSON.stringify(held.config.subgraph);
    await executeGraph(graph([held]), { runtime: shouting, registry });
    expect(JSON.stringify(held.config.subgraph)).toBe(before);
  });

  it('fails with the inner node named, and the outer one', async () => {
    const breaking: Runtime = { ...shouting, code: { run: async () => { throw new Error('the body blew up'); } } };
    const result = await executeGraph(graph([holder()]), { runtime: breaking, registry });

    expect(result.status).toBe('error');
    const failed = result.node_results.find((r) => r.node_id === 'part')!;
    expect(failed.status).toBe('error');
    expect(failed.error).toMatch(/Inside "part"/);
    expect(failed.error).toMatch(/code node "shout" failed: the body blew up/);
  });

  it('reports the inner run as its own progress, not as nodes nobody expected', async () => {
    const seen: string[] = [];
    const watched: Runtime = { ...shouting, report: (event) => seen.push(`${event.type}:${event.node_id}`) };
    await executeGraph(graph([holder()]), { runtime: watched, registry });

    // The outer node started and finished; nothing inside was announced as a
    // node of the run the page is counting.
    expect(seen).toContain('node_start:part');
    expect(seen.filter((line) => line.includes('shout'))).toEqual([]);
  });

  it('stops when the run is stopped, down to the graph inside', async () => {
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
    const result = await running;
    expect(result.status).toBe('cancelled');
  });

  it('will not nest deeper than a person can follow', async () => {
    // Six deep: each graph holds the next, which is one past the limit.
    let held: unknown = { metadata: { name: 'bottom' }, nodes: [], edges: [] };
    for (let level = 0; level < 6; level += 1) {
      held = { metadata: { name: `level ${level}` }, nodes: [node('part', 'subgraph', { subgraph: held })], edges: [] };
    }
    const result = await executeGraph(parseGraph(held), { runtime: shouting, registry });
    expect(result.error).toMatch(/5 deep/);
  });
});

describe('events and a graph inside a node', () => {
  it('starts a start point in there that is wired into a ◆: the graph above sending to it opens the node', async () => {
    const held = inner() as { nodes: GraphNode[]; edges: ReturnType<typeof edge>[] };
    held.nodes.push(node('go', 'start', { started_by: 'call' }));
    held.edges.push(edge('gate', 'go', 'data', 'shout', '__run'));
    const outer = graph([
      node('press', 'code', { code: 'x' }, { outputs: ['output'] }),
      node('part', 'subgraph', { subgraph: held }),
    ], [edge('e', 'press', 'output', 'part', 'go')]);
    const pressing: Runtime = {
      ...shouting,
      code: { run: async (_body, inputs) => ('value' in inputs ? { output: String(inputs.value).toUpperCase() } : { output: 'pressed' }) },
    };
    const result = await executeGraph(outer, { runtime: pressing, registry });
    expect(result.node_results.find((r) => r.node_id === 'part')?.outputs).toEqual({ loud: 'FROM INSIDE' });
  });

  it('is told that a start point in there the page starts is started by nothing', () => {
    const held = inner() as { nodes: GraphNode[] };
    held.nodes.push(node('press', 'start', { started_by: 'page' }));
    const found = registry.node('subgraph')!.problems(node('part', 'subgraph', { subgraph: held }), registry, 'part');
    expect(found.map((p) => p.where)).toEqual(['part ▸ press']);
    expect(found[0].fix).toMatch(/Let a call start it/);
  });

  it('is told that a clock in there never ticks', () => {
    const held = inner() as { nodes: GraphNode[] };
    held.nodes.push(node('clock', 'start', { started_by: 'itself', every: '5m' }));
    held.nodes.push(node('once', 'start', { started_by: 'itself' }));
    const found = registry.node('subgraph')!.problems(node('part', 'subgraph', { subgraph: held }), registry, 'part');
    expect(found.map((p) => p.where)).toEqual(['part ▸ clock']);
    expect(found[0].problem).toMatch(/never ticks/);
  });

  it('is told that a start point in there whose example is keyed otherwise than it is sent from up here hands on nothing', async () => {
    // Rebuilt by hand: the inner start point "start", headed "Text", had its
    // example keyed "text" and its input taking "text"; a run from the graph
    // above returned 0/0/empty, and nothing said why.
    const held = inner() as { nodes: GraphNode[] };
    held.nodes[0] = { ...held.nodes[0], label: 'Text', config: { started_by: 'call', values: { text: 'from inside' } } };
    held.nodes[1] = taking(held.nodes[1], 'value', 'text');
    const part = node('part', 'subgraph', { subgraph: held });
    const found = registry.node('subgraph')!.problems(part, registry, 'part');
    expect(found).toEqual([expect.objectContaining({ where: 'part ▸ node "subject"' })]);
    expect(found[0].problem).toContain('The graph above sends it its value under "subject"');
    expect(found[0].fix).toContain('{"subject": …}');
    // As a run from up here finds: the input is handed nothing.
    const run = await executeGraph(graph([node('in', 'start', { started_by: 'call', values: { x: 'hello' } }), part],
      [edge('w', 'in', 'data', 'part', 'subject')]), { runtime: shouting, registry });
    expect(run.node_results.find((r) => r.node_id === 'part')?.outputs).toEqual({ loud: '' });
    // Keyed under its id, there is nothing to say.
    expect(registry.node('subgraph')!.problems(holder(), registry, 'part')).toEqual([]);
  });
});

describe('what a bundle of it needs', () => {
  // The graph inside is followed by `bundleNeeds` on its own: the node itself runs it and asks nothing.
  const empty = { metadata: { name: 'inside' }, nodes: [], edges: [] };

  it('is no model around a graph that asks none', () => {
    const part = node('part', 'subgraph', { subgraph: empty });
    expect(bundleNeeds(graph([part])).ai).toBe(false);
    expect(registry.node('subgraph')!.asksModel(part)).toBe(false);
  });
});
