import { beforeEach, describe, it, expect } from 'vitest';
import type { GraphNode } from '../graph';
import { useGraphStore } from './graphStore';
import { NODE_KINDS } from '../model/nodeKinds';
import { nodePanel } from '../../graph/node/nodePanel';
import { enterGraphOf } from '../../graph/nodes/subgraph/SubgraphNodePanel';
import { registry } from '../../../../graph/nodes/registry.ts';

// Held here, beside the store it goes in and out of, because the rule is its
// own: what a node's panel still holds is written into the graph the panel
// was opened in, before the canvas goes into the node -- and without the
// marks the panel puts on its ports (`trackPorts`), which are never stored.

const store = () => useGraphStore.getState();
const stored = (id: string) => store().rfNodes.find((item) => item.id === id)?.data.graphNode as GraphNode | undefined;

beforeEach(() => {
  store().loadGraph({ metadata: { name: 'Outer', description: '', gui_scheme: 'night' }, nodes: [NODE_KINDS.subgraph.create('part')], edges: [] });
});

describe('going into a node\'s graph from its panel', () => {
  it('writes what the panel still holds into the graph out here first, as a node is stored', () => {
    store().setEditingNode('part');
    const panel = nodePanel('part');
    const stop = panel.watch(() => {});
    panel.setConfig('prompt', 'Summarise');
    enterGraphOf('part');
    stop();

    expect(store().subgraphStack).toHaveLength(1);
    store().closeSubgraph();
    const part = stored('part')!;
    expect(part.config.prompt).toBe('Summarise');
    for (const kept of [...part.inputs, ...part.outputs]) {
      expect(Object.getOwnPropertySymbols(kept)).toEqual([]);
    }
  });

  it('takes the wires of a port that went with the graph it held: closing a node whose end point was deleted leaves none to it', () => {
    const inner = { metadata: { name: 'In', description: '', gui_scheme: 'night' }, nodes: [NODE_KINDS.start.create('s'), NODE_KINDS.end.create('e')], edges: [] };
    const part = NODE_KINDS.subgraph.create('part');
    registry.node('subgraph')!.setNestedGraph(part as never, inner as never);
    store().loadGraph({ metadata: { name: 'Outer', description: '', gui_scheme: 'night' }, nodes: [part, NODE_KINDS.code.create('after')], edges: [] });
    const out = stored('part')!.outputs[0];
    store().connect({ source: 'part', sourceHandle: out.id, target: 'after', targetHandle: 'in' });
    expect(store().rfEdges).toHaveLength(1);

    store().openSubgraph('part');
    store().deleteNodes([out.id]);
    store().closeSubgraph();
    expect(stored('part')!.outputs).toEqual([]);
    expect(store().rfEdges).toEqual([]);
    expect(store().exportGraph().edges).toEqual([]);
  });
});
