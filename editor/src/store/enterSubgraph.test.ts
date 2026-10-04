import { beforeEach, describe, it, expect } from 'vitest';
import type { GraphNode } from '@/graph';
import { useGraphStore } from './graphStore';
import { NODE_KINDS } from '@/document/nodeKinds';
import { nodePanel } from '@/canvas/nodePanel';
import { enterGraphOf } from '@/elements/nodes/subgraph/SubgraphNodePanel';

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
});

describe('going into a node\'s graph and out again, changing nothing', () => {
  it('leaves the document saved, though its file wrote a setting at its default', () => {
    // Re-test: nested_statistics read "● Unsaved changes" once its Statistics node was entered.
    const part = NODE_KINDS.subgraph.create('part');
    const inner = NODE_KINDS.code.create('count');
    inner.config = { ...inner.config, batch_mode: 'whole_list', code: 'function run() { return {}; }' };
    part.config = { ...part.config, subgraph: { metadata: { name: 'Inner', description: '' }, nodes: [inner], edges: [] } } as GraphNode['config'];
    store().loadGraph({ metadata: { name: 'Outer', description: '', gui_scheme: 'night' }, nodes: [part], edges: [] });
    expect(store().isDirty()).toBe(false);
    enterGraphOf('part');
    expect(store().isDirty()).toBe(false);
    store().closeSubgraph();
    expect(store().isDirty()).toBe(false);
  });
});
