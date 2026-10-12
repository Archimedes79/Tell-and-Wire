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

  it('does when the graph inside a subgraph does', () => {
    const inner = { nodes: [node('a', 'ai')], edges: [] };
    expect(graphCallsModel(parseGraph({ nodes: [node('s', 'subgraph', { subgraph: inner })], edges: [] }), registry)).toBe(true);
    expect(graphCallsModel(parseGraph({ nodes: [node('s', 'subgraph', { subgraph: { nodes: [], edges: [] } })], edges: [] }), registry)).toBe(false);
  });
});
