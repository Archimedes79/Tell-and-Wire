import { describe, expect, it } from 'vitest';
import { parseGraph } from './graph.ts';
import { registry } from './nodes/registry.ts';
import { graphCallsModel } from './usesModel.ts';

const node = (id: string, node_type: string, config: Record<string, unknown> = {}) => ({
  id, node_type, label: id, description: '', inputs: [], outputs: [], config,
});

describe('whether running a graph asks a model', () => {
  it('does when a node is an AI node, or its code calls node.llm -- and not for code that does not', () => {
    expect(graphCallsModel(parseGraph({ nodes: [node('a', 'ai')], edges: [] }), registry)).toBe(true);
    expect(graphCallsModel(parseGraph({ nodes: [node('c', 'code', { code: 'const x = await node.llm({ prompt: "hi" });' })], edges: [] }), registry)).toBe(true);
    expect(graphCallsModel(parseGraph({ nodes: [node('c', 'code', { code: 'function run(i) { return { n: 1 }; }' })], edges: [] }), registry)).toBe(false);
    expect(graphCallsModel(parseGraph({ nodes: [], edges: [] }), registry)).toBe(false);
  });

  it('does for code that reaches the model by another name for its second parameter, by ["llm"] or by taking llm out of it', () => {
    const calls = (code: string) => graphCallsModel(parseGraph({ nodes: [node('c', 'code', { code })], edges: [] }), registry);
    expect(calls('async function run(i, tools) { return { a: await tools.llm({ prompt: "x" }) }; }')).toBe(true);
    expect(calls('async function run(i, n) { return { a: await n["llm"]({ prompt: "x" }) }; }')).toBe(true);
    expect(calls('async function run(i, { llm }) { return { a: await llm({ prompt: "x" }) }; }')).toBe(true);
    expect(calls('async function run(i, { x, llm: ask }) { return { a: await ask({}) }; }')).toBe(true);
    expect(calls('function run(i) { return { llmCount: i.llmCount, words: "llm" }; }')).toBe(false);
  });

  it('does when the graph inside a subgraph does', () => {
    const inner = { nodes: [node('a', 'ai')], edges: [] };
    expect(graphCallsModel(parseGraph({ nodes: [node('s', 'subgraph', { subgraph: inner })], edges: [] }), registry)).toBe(true);
    expect(graphCallsModel(parseGraph({ nodes: [node('s', 'subgraph', { subgraph: { nodes: [], edges: [] } })], edges: [] }), registry)).toBe(false);
  });
});
