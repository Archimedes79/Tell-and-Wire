import { describe, it, expect } from 'vitest';
import { parseGraph } from '../graph.ts';
import { executeGraph, inputsFor } from './executor.ts';
import type { Runtime } from '../elements/Runtime.ts';
import { registry } from '../elements/registry.ts';
import { nodeCode } from '../core/node.ts';
import { quietRuntime } from '../../test/fakes.ts';

/**
 * What a run reports beyond each node's outputs: what it kept, what it left
 * alone, and that it can be stopped.
 */

const port = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id, ...extra });

/** A body is recognised by a word in it, so a test can say what a node does without a sandbox. */
function runtime(over: Partial<Runtime> = {}): Runtime {
  return quietRuntime({
    code: {
      run: async (body, inputs) => {
        if (body.includes('DOUBLE')) return { out: Number(inputs.n) * 2 };
        return inputs;
      },
    },
    ai: { complete: async (request) => `answer to: ${request.prompt}` },
    ...over,
  });
}

describe('what a run remembers', () => {
  it('keeps what an ordinary edge delivers to a data node, loop or no loop', async () => {
    const graph = parseGraph({
      nodes: [
        { id: 'text', node_type: 'data', config: { data_value: 'kept' }, outputs: [port('output')] },
        { id: 'store', node_type: 'data', inputs: [port('input')], outputs: [port('output')], config: {} },
      ],
      edges: [{ id: 'e', source_node_id: 'text', source_port_id: 'output', target_node_id: 'store', target_port_id: 'input' }],
    });
    await executeGraph(graph, { runtime: runtime(), registry });
    expect(graph.nodes[1].config.data_value).toBe('kept');
  });
});

describe('a node with nothing to do', () => {
  /** A chat's start point, sent what a chat sends: the message, and what was said before it. */
  const chat = (message: string) => parseGraph({
    nodes: [
      { id: 'send', node_type: 'start', config: { values: { chat: { message, history: '' } } } },
      {
        id: 'ai', node_type: 'ai', inputs: [port('message', { required: true, field: 'chat.message' })], outputs: [port('output')],
        config: { ai_model: 'm' },
      },
      { id: 'reply', node_type: 'end', inputs: [port('value')], config: {} },
    ],
    edges: [
      { id: 'm', source_node_id: 'send', source_port_id: 'data', target_node_id: 'ai', target_port_id: 'message' },
      { id: 'r', source_node_id: 'ai', source_port_id: 'output', target_node_id: 'reply', target_port_id: 'value' },
    ],
  });

  it('is left alone when a wired, required input brought nothing -- and the run is still a success', async () => {
    // ▶ Run on a chat nobody has typed into. Asking the model "User:" is not
    // a question, and its answer would be written into the conversation.
    let asked = 0;
    const result = await executeGraph(chat(''), {
      registry, runtime: runtime({ ai: { complete: async () => { asked += 1; return 'hm'; } } }),
    });
    expect(asked).toBe(0);
    expect(result.status).toBe('success');
    expect(result.node_results.find((r) => r.node_id === 'ai')).toMatchObject({ status: 'skipped' });
    // Nothing reached the end point, so the chat that shows it is handed nothing.
    expect(result.node_results.find((r) => r.node_id === 'reply')).toMatchObject({ status: 'skipped' });
  });

  it('runs as soon as there is something to say', async () => {
    const result = await executeGraph(chat('hello'), { registry, runtime: runtime() });
    expect(result.node_results.find((r) => r.node_id === 'ai')?.outputs.output).toBe('answer to: hello');
  });
});

describe('stopping', () => {
  it('ends the body in flight and starts nothing after it', async () => {
    const graph = parseGraph({
      nodes: [
        { id: 'slow', node_type: 'code', outputs: [port('out')], config: { code: 'async function run() { await new Promise((r) => setTimeout(r, 30000)); return { out: 1 }; }' } },
        { id: 'after', node_type: 'code', inputs: [port('n')], outputs: [port('out')], config: { code: 'function run(i) { return { out: i.n }; }' } },
      ],
      edges: [{ id: 'e', source_node_id: 'slow', source_port_id: 'out', target_node_id: 'after', target_port_id: 'n' }],
    });
    const stop = new AbortController();
    const started = Date.now();
    setTimeout(() => stop.abort(), 400);
    // The real sandbox: what must be shown is that the *process* ends.
    const result = await executeGraph(graph, { registry, runtime: runtime({ code: nodeCode }), signal: stop.signal });
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(result.status).toBe('cancelled');
    expect(result.node_results.map((r) => r.node_id)).toEqual(['slow']);
  }, 20_000);

  it('hands the signal to every model call', async () => {
    const seen: (AbortSignal | undefined)[] = [];
    const stop = new AbortController();
    const graph = parseGraph({ nodes: [{ id: 'ai', node_type: 'ai', outputs: [port('output')], config: { ai_model: 'm', prompt: 'Say hello.' } }], edges: [] });
    await executeGraph(graph, {
      registry, signal: stop.signal,
      runtime: runtime({ ai: { complete: async (request) => { seen.push(request.signal); return 'x'; } } }),
    });
    expect(seen).toEqual([stop.signal]);
  });
});

describe('inputsFor', () => {
  it('runs what feeds a node, hands back what would arrive, and does not run the node', async () => {
    let asked = 0;
    const graph = parseGraph({
      nodes: [
        { id: 'text', node_type: 'data', config: { data_value: 'a question' }, outputs: [port('output')] },
        { id: 'ai', node_type: 'ai', inputs: [port('prompt')], outputs: [port('output')], config: { ai_model: 'm' } },
        { id: 'end', node_type: 'end', inputs: [port('value')], config: {} },
      ],
      edges: [
        { id: 'a', source_node_id: 'text', source_port_id: 'output', target_node_id: 'ai', target_port_id: 'prompt' },
        { id: 'b', source_node_id: 'ai', source_port_id: 'output', target_node_id: 'end', target_port_id: 'value' },
      ],
    });
    const { inputs, upstream } = await inputsFor(graph, 'ai', {
      registry, runtime: runtime({ ai: { complete: async () => { asked += 1; return 'x'; } } }),
    });
    expect(inputs).toEqual({ prompt: 'a question' });
    expect(asked).toBe(0);
    expect(upstream.node_results.map((r) => r.node_id)).toEqual(['text']);
  });

  it('finds what an end point would be handed, from what its start point was sent', async () => {
    const graph = parseGraph({
      nodes: [
        { id: 'pick', node_type: 'start', config: { values: { n: 21 } } },
        { id: 'double', node_type: 'code', inputs: [port('n', { field: 'n' })], outputs: [port('out')], config: { code: '/* DOUBLE */' } },
        { id: 'shown', node_type: 'end', inputs: [port('value')], config: {} },
      ],
      edges: [
        { id: 'a', source_node_id: 'pick', source_port_id: 'data', target_node_id: 'double', target_port_id: 'n' },
        { id: 'b', source_node_id: 'double', source_port_id: 'out', target_node_id: 'shown', target_port_id: 'value' },
      ],
    });
    const { inputs } = await inputsFor(graph, 'shown', { registry, runtime: runtime() });
    expect(inputs).toEqual({ value: 42 });
  });
});
