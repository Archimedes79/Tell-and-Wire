import { beforeEach, describe, expect, it } from 'vitest';
import type { GraphNode } from '../graph';
import { useGraphStore } from './graphStore';
import { NODE_KINDS } from '../document/nodeKinds';
import { nodePanel } from '../../graph-editor/node/nodePanel';

// What the bar under the canvas and the node view ask of the store: a graph
// changed as a whole, taken as one step of the same document, and a node's
// view that writes what it still holds before it is left.

const store = () => useGraphStore.getState();
const stored = (id: string) => store().rfNodes.find((item) => item.id === id)?.data.graphNode as GraphNode | undefined;

beforeEach(() => {
  store().loadGraph({
    metadata: { name: 'Words', description: '', gui_scheme: 'night' },
    nodes: [{ ...NODE_KINDS.code.create('count'), label: 'Count' }, NODE_KINDS.end.create('shown')],
    edges: [{ id: 'e', source_node_id: 'count', source_port_id: 'output', target_node_id: 'shown', target_port_id: 'value' }],
  });
});

describe('a graph changed as said', () => {
  it('is one undo step of the same document, and leaves a node\'s panel open only while its node is there', () => {
    store().setCurrentFilePath('/work/words', true);
    store().setEditingNode('count');
    const document = store().document;
    const graph = store().exportGraph();
    store().changeGraph({
      ...graph,
      nodes: [...graph.nodes.map((node) => (node.id === 'count' ? { ...node, label: 'Count words' } : node)), NODE_KINDS.end.create('more')],
    });
    expect(stored('count')!.label).toBe('Count words');
    expect(stored('more')).toBeDefined();
    expect(store().rfEdges).toHaveLength(1);
    expect(store().currentFilePath).toBe('/work/words');
    expect(store().document).toBe(document);
    expect(store().editingNodeId).toBe('count');
    expect(store().isDirty()).toBe(true);
    store().undo();
    expect(stored('count')!.label).toBe('Count');
    expect(stored('more')).toBeUndefined();
    expect(store().isDirty()).toBe(false);

    store().changeGraph({ ...graph, nodes: graph.nodes.filter((node) => node.id !== 'count') });
    expect(store().editingNodeId).toBeNull();
  });
});

describe('a node opened', () => {
  it('writes what it still holds when another node is chosen or the selection is cleared', () => {
    store().setEditingNode('count');
    const panel = nodePanel('count');
    const stop = panel.watch(() => {});
    panel.setConfig('code', 'function run() {}');
    store().setEditingNode('shown');
    expect(stored('count')!.config.code).toBe('function run() {}');
    expect(store().editingNodeId).toBe('shown');

    store().setEditingNode('count');
    panel.setConfig('code', 'function run() { return {}; }');
    store().clearSelection();
    expect(stored('count')!.config.code).toBe('function run() { return {}; }');
    expect(store().editingNodeId).toBeNull();
    stop();
  });
});
