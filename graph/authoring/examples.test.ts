import { describe, it, expect } from 'vitest';
import { runExample, testGraph } from './examples.ts';
import { registry } from '../nodes/registry.ts';
import { parseGraph, type Graph } from '../graph.ts';
import type { AiRequest } from '../nodes/Runtime.ts';
import { quietRuntime } from '../test/fakes.ts';

const port = (id: string, kind: 'input' | 'output', extra: Record<string, unknown> = {}) =>
  ({ id, name: id, kind, data_type: 'any', multi: false, required: false, description: '', ...extra });

/** A body run in this process: `run(inputs)`, as the sandbox would run it. */
const running = quietRuntime({ code: { run: async (body, inputs) => new Function('inputs', `${body}; return run(inputs);`)(inputs) } });

/** One code node counting lines, with the definitions given. */
const counter = (config: Record<string, unknown>, inputs = [port('text', 'input', { data_type: 'file_path' })]): Graph => parseGraph({
  metadata: { name: 't' },
  nodes: [{
    id: 'count', node_type: 'code', label: 'Count', inputs, outputs: [port('lines', 'output')],
    config: { code: 'function run(i) { return { lines: String(i.text ?? "").split("\\n").length }; }', ...config },
  }],
  edges: [],
});

const INPUT = 'module.exports = { "text": "a\\nb\\nc" };';
const OUTPUT = 'module.exports = { "lines": 3 };';

describe('a node\'s example', () => {
  it('is one call on its input.js, held to its output.js: it passes, fails where the result does not fit, and errors where the node does', async () => {
    const run = (config: Record<string, unknown>) => runExample(counter({ input_definition: INPUT, ...config }), 'count', { runtime: running, registry });

    expect(await run({ output_definition: OUTPUT })).toEqual({ status: 'pass', details: [], outputs: { lines: 3 }, held: true });

    const misfit = await run({ output_definition: 'module.exports = { "lines": "three", "words": 2 };' });
    expect(misfit.status).toBe('fail');
    expect(misfit.details).toEqual(['output "words" is missing', 'output "lines" is a number; output.js says text']);

    expect(await run({ code: 'function run() { throw new Error("no rows"); }' })).toMatchObject({ status: 'error', details: ['no rows'] });
  });

  it('asks the model for an ai node and, offline, skips it; a graph is tested at every depth', async () => {
    const asked: AiRequest[] = [];
    const say = parseGraph({
      metadata: { name: 't' },
      nodes: [{
        id: 'say', node_type: 'ai', label: 'Say', description: 'Count the lines.', inputs: [port('text', 'input')], outputs: [port('count', 'output')],
        config: { input_definition: INPUT, output_definition: 'module.exports = { "count": 3 };' },
      }],
      edges: [],
    });
    const runtime = quietRuntime({ ai: { complete: async (request) => { asked.push(request); return '{"count": 3}'; } } });
    expect(await runExample(say, 'say', { runtime, registry, offline: true })).toMatchObject({ status: 'skipped' });
    expect(asked).toEqual([]);
    expect(await runExample(say, 'say', { runtime, registry })).toMatchObject({ status: 'pass', outputs: { count: 3 } });
    expect(asked[0].prompt).toBe('a\nb\nc');

    const inner = counter({ input_definition: INPUT, output_definition: OUTPUT });
    const graph = parseGraph({
      metadata: { name: 'outer' },
      nodes: [
        ...counter({ input_definition: INPUT, output_definition: OUTPUT }).nodes,
        // Not tried, and said: it has inputs, and no input.js to try it on.
        { ...counter({}).nodes[0], id: 'plain' },
        { id: 'part', node_type: 'subgraph', label: 'Part', inputs: [], outputs: [], config: { subgraph: inner } },
      ],
      edges: [],
    });
    const { tested, results } = await testGraph(graph, { runtime: () => running, registry });
    expect(tested).toBe(3);
    expect(results.map(({ inside, nodeId, result }) => `${inside}${nodeId}: ${result.status}`)).toEqual(['count: pass', 'plain: skipped', 'part ▸ count: pass']);
  });
});
