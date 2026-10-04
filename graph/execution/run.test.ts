import { describe, it, expect } from 'vitest';
import { parseGraph } from '../graph.ts';
import { executeGraph } from './executor.ts';
import type { Runtime } from '../nodes/Runtime.ts';
import { registry } from '../nodes/registry.ts';
import { nodeCode } from '../core/node.ts';
import { quietRuntime } from '../test/fakes.ts';

/** What a run leaves alone, and that it can be stopped. */

const port = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id, ...extra });

/** A runtime whose model answers with the prompt. */
function runtime(over: Partial<Runtime> = {}): Runtime {
  return quietRuntime({ ai: { complete: async (request) => `answer to: ${request.prompt}` }, ...over });
}

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

    // It runs as soon as there is something to say.
    const said = await executeGraph(chat('hello'), { registry, runtime: runtime() });
    expect(said.node_results.find((r) => r.node_id === 'ai')?.outputs.output).toBe('answer to: hello');
  });
});

describe('Stop', () => {
  it('ends the body in flight, as a process, and starts nothing after it', async () => {
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
});
