import { describe, it, expect } from 'vitest';
import type { GraphNode } from '../../graph.ts';
import type { AiRequest, Runtime } from '../Runtime.ts';
import { registry } from '../registry.ts';
import { nodeCode } from '../../core/node.ts';
import { quietRuntime } from '../../test/fakes.ts';

/**
 * `node.llm`: a body asking the process that holds the keys for a model call.
 *
 * The real sandbox throughout -- what is tested is a body in another process
 * asking this one for a model call, and a fake runner would test nothing.
 */

const port = (id: string, kind: 'input' | 'output') =>
  ({ id, name: id, kind, data_type: 'any' as const, multi: false, required: false, description: '' });

const codeNode = (code: string): GraphNode => ({
  id: 'ask', node_type: 'code', label: 'Ask', description: '', position: { x: 0, y: 0 },
  inputs: [port('text', 'input')], outputs: [port('output', 'output')], config: { code },
});

function recording(reply: (request: AiRequest) => string = () => 'an answer'): Runtime & { asked: AiRequest[] } {
  const asked: AiRequest[] = [];
  return {
    asked,
    ...quietRuntime({ code: nodeCode, ai: { complete: async (request) => { asked.push(request); return reply(request); } } }),
  };
}

const code = registry.node('code')!;

describe('a code node', () => {
  it('may ask a model, on the graph\'s default, a bundle of it says so, and it may ask only so often', async () => {
    const runtime = recording(() => 'forty-two');
    const node = codeNode('async function run(i, node) { return { output: await node.llm({ prompt: "What is " + i.text + "?" }) }; }');
    expect(await code.execute(node, { text: '6 x 7' }, runtime)).toEqual({ output: 'forty-two' });
    expect(runtime.asked[0]).toMatchObject({ prompt: 'What is 6 x 7?', provider: 'default', system: '' });
    expect(code.deployNeeds(node).asksAi).toBe(true);
    expect(code.deployNeeds(codeNode('function run() { return { a: 1 }; }')).asksAi).toBe(false);

    // Told when it has asked as often as it may, instead of spending a budget.
    const capped = { ...recording(), llmCallsPerBody: 3 };
    const looping = codeNode('async function run(i, node) { for (;;) await node.llm({ prompt: "again" }); }');
    await expect(code.execute(looping, { text: 'x' }, capped)).rejects.toThrow(/asked the model 3 times/);
    expect(capped.asked).toHaveLength(3);
  }, 30_000);
});
