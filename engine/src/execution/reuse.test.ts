import { describe, it, expect } from 'vitest';
import { executeGraph } from './executor.ts';
import { LastOutputs } from './reuse.ts';
import { registry } from '../elements/registry.ts';
import type { ModelChoice } from '../elements/Runtime.ts';
import type { GraphNode } from '../graph.ts';
import { edge, graphOf, quietRuntime } from '../../test/fakes.ts';

/**
 * What a node run only as context hands back from an earlier round, and when
 * it asks again instead.
 */

/** *takes* names input ports, each taking one value of what arrives: `port:field`. */
function node(id: string, type: string, config: Record<string, unknown>, takes: string[] = []): GraphNode {
  const inputs = takes.map((spec) => {
    const [name, field] = spec.split(':');
    return { id: name, name, kind: 'input' as const, data_type: 'any' as const, multi: false, required: false, description: '', ...(field ? { field } : {}) };
  });
  return { id, node_type: type as GraphNode['node_type'], label: id, description: '', position: { x: 0, y: 0 }, inputs, outputs: [], config };
}

describe('a node that asks the model, run as context', () => {
  it('asks again once the model it is answered by has changed', async () => {
    // After another model was chosen in ⚙ Settings it kept handing back what
    // the one before had answered: nothing about the node or its inputs had
    // changed.
    let setting: ModelChoice = { provider: 'ollama', model: 'first' };
    let asked = 0;
    const runtime = quietRuntime({
      ai: {
        complete: async () => { asked += 1; return `said by ${setting.model}`; },
        setting: async () => setting,
      },
      code: { run: async (_body, inputs) => ({ text: `${String(inputs.len)}: ${String(inputs.text)}` }) },
    });
    const graph = graphOf([
      node('ask', 'start', { values: { msg: 'hello' } }),
      node('choose', 'start', { values: { len: 'short' } }),
      node('model', 'ai', {}, ['message:msg']),
      node('shape', 'code', { code: 'shape' }, ['text', 'len:len']),
    ], [
      edge('m', 'ask', 'data', 'model', 'message'),
      edge('t', 'model', 'output', 'shape', 'text'),
      edge('l', 'choose', 'data', 'shape', 'len'),
    ]);
    const reuse = new LastOutputs();
    const round = async () => (await executeGraph(graph, { runtime, registry, reuse, trigger: { node_id: 'choose', port_id: 'data' } }))
      .node_results.find((result) => result.node_id === 'shape')!.outputs.text;

    expect(await round()).toBe('short: said by first');
    expect(await round()).toBe('short: said by first');
    expect(asked).toBe(1);
    // Said as reused, not as run: the round line counted it among what ran.
    const again = await executeGraph(graph, { runtime, registry, reuse, trigger: { node_id: 'choose', port_id: 'data' } });
    expect(again.node_results.find((result) => result.node_id === 'model')).toMatchObject({ status: 'success', reused: true });
    expect(again.node_results.find((result) => result.node_id === 'shape')?.reused).toBeUndefined();
    setting = { provider: 'ollama', model: 'second' };
    expect(await round()).toBe('short: said by second');
    expect(asked).toBe(2);
  });
});

describe('a folder listed at a path it is sent, run as context', () => {
  it('lists the folder again every round: a file added since is in it', async () => {
    // Fed its path, it was handed back from the round before: the folder was
    // the same path, and the file added to it was not there.
    const inFolder = ['a.txt'];
    const runtime = quietRuntime({
      files: { list: async () => [...inFolder] },
      code: { run: async (_body, inputs) => ({ n: (inputs.files as string[]).length, len: inputs.len }) },
    });
    const graph = graphOf([
      node('pick', 'start', { values: { folder: 'docs' } }),
      node('choose', 'start', { values: { len: 'short' } }),
      node('listed', 'folder', {}, ['path:folder']),
      node('count', 'code', { code: 'count' }, ['files', 'len:len']),
    ], [
      edge('p', 'pick', 'data', 'listed', 'path'),
      edge('f', 'listed', 'files', 'count', 'files'),
      edge('l', 'choose', 'data', 'count', 'len'),
    ]);
    const reuse = new LastOutputs();
    const round = async () => (await executeGraph(graph, { runtime, registry, reuse, trigger: { node_id: 'choose', port_id: 'data' } }))
      .node_results.find((result) => result.node_id === 'count')!.outputs.n;
    expect(await round()).toBe(1);
    inFolder.push('b.txt');
    expect(await round()).toBe(2);
  });
});
