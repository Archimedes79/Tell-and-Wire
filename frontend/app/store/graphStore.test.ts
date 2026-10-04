import { describe, it, expect } from 'vitest';
import { useGraphStore } from './graphStore';
import type { Graph, GraphNode } from '../graph';
import { baseNodeConfig } from '../document/baseNodeConfig';
import { WIDGET_BUILDERS } from '../elements/registry';
import { NESTED_GRAPH_FIELD } from '../../../backend/app/project/changes.ts';
import { NODE_KINDS } from '../document/nodeKinds';
import { answers as runAnswers } from '../../test/runAnswers';

function graphNode(overrides: Partial<GraphNode>): GraphNode {
  return {
    id: 'n',
    node_type: 'folder',
    label: 'Node',
    description: '',
    position: { x: 0, y: 0 },
    inputs: [],
    outputs: [],
    config: baseNodeConfig(),
    ...overrides,
  };
}

const port = (id: string, kind: 'input' | 'output', name = id) =>
  ({ id, name, kind, data_type: 'any' as const, multi: false, required: false, description: '' });

function loadTestGraph(nodes: GraphNode[], edges: Graph['edges'] = [], page?: Graph['page']) {
  useGraphStore.getState().loadGraph({
    metadata: { name: 'Test', description: '', gui_scheme: 'night' },
    nodes,
    edges,
    ...(page ? { page } : {}),
  });
}

const store = () => useGraphStore.getState();
const nodeById = (id: string) => store().rfNodes.find((n) => n.id === id)!.data.graphNode as GraphNode;

describe('graphStore.loadGraph', () => {
  it('opens a document clean, and saves what it was given: a size, a page, a node of a type this editor does not know', () => {
    const note = WIDGET_BUILDERS.text.create('note', 'Note');
    const sized = graphNode({ id: 'sized', width: 340, height: 300, outputs: [port('output', 'output')] });
    // A node of a newer version: kept as it came, wires and all.
    const later = {
      id: 'later', node_type: 'vision', label: 'Later', description: '', position: { x: 5, y: 6 },
      inputs: [port('picture', 'input')], outputs: [], config: { batch_mode: 'whole_list', lens: 'wide' },
    } as unknown as GraphNode;
    loadTestGraph([sized, graphNode({ id: 'plain' }), later],
      [{ id: 'e1', source_node_id: 'sized', source_port_id: 'output', target_node_id: 'later', target_port_id: 'picture' }],
      { blocks: [note] });
    // What ReactFlow does once a node is drawn: it reports what the node measured. That is no change.
    store().setRFNodes(store().rfNodes.map((n) => ({ ...n, width: 675, height: 366 })));
    expect(store().isDirty()).toBe(false);

    const saved = store().exportGraph();
    expect(saved.nodes.find((n) => n.id === 'later')).toEqual(later);
    expect(saved.nodes.find((n) => n.id === 'sized')).toMatchObject({ width: 340, height: 300 });
    expect(saved.nodes.find((n) => n.id === 'plain')!.width).toBeUndefined();
    expect(saved.edges).toHaveLength(1);
    expect(saved.page).toEqual({ blocks: [note] });
    loadTestGraph([], [], { blocks: [] });
    expect(store().exportGraph()).not.toHaveProperty('page');
  });

  /**
   * A graph written by hand, by the MCP server or by a model leaves keys out, and the
   * a run reads each missing one some way. Opening such a graph and saving it must not
   * change what it does: the editor used to fill a missing key with what a *new* node
   * starts with. (`elements/savedConfig.test.ts` holds a saved node to the full one; this
   * holds a loaded node to the file it was loaded from.)
   */
  it('leaves a key the file leaves out as it was: every node type, opened and saved, runs as the file said', () => {
    for (const kind of Object.values(NODE_KINDS)) {
      const bare = { ...kind.create('n'), config: {} as GraphNode['config'] };
      loadTestGraph([bare]);
      const saved = store().exportGraph().nodes[0];
      expect(runAnswers(saved, ['config']), bare.node_type).toEqual(runAnswers(bare, ['config']));
    }
  });
});

describe('graphStore: what a round remembered', () => {
  // What using a graph leaves behind is the server's session's, never the document's
  // (docs/architecture.md, "State"): no undo step, nothing to save, nothing Deploy would ship.
  it('shows what a round made, and keeps none of it in the document', () => {
    const chat = WIDGET_BUILDERS.chat.create('talk', 'Talk');
    loadTestGraph([graphNode({ id: 'data1', node_type: 'data', config: { ...baseNodeConfig(), data_value: 'old value' } })], [], { blocks: [chat] });
    const before = store().exportGraph();
    const result = {
      status: 'success', node_results: [{ node_id: 'data1', status: 'success', inputs: {}, outputs: { output: 'new value' } }],
      memory: [{ node_id: 'data1', port_id: 'input', value: 'new value' }],
    };
    store().setExecutionResult(result as never);
    expect(store().executionResult).toBe(result);
    expect(store().exportGraph()).toEqual(before);
    expect(store().isDirty()).toBe(false);
  });
});

describe('graphStore.takeDiskChanges', () => {
  const inner = (nodes: unknown[] = []) => ({ metadata: { name: 'Inner', description: '', gui_scheme: 'night' }, nodes, edges: [] });

  it('takes what changed on disk in as one undo step, and leaves a graph inside a node alone while there is unsaved work', () => {
    loadTestGraph([
      graphNode({
        id: 'count', node_type: 'code', outputs: [port('total', 'output', 'Total')],
        config: { ...baseNodeConfig(), code: 'function run() { return { total: 1 }; }' },
      }),
      graphNode({ id: 'part', node_type: 'subgraph', config: { ...baseNodeConfig(), subgraph: inner() } }),
    ]);
    store().markSaved();

    // The graph a node holds, changed in its folder: taken whole, its ports following.
    store().takeDiskChanges([{ node_id: 'part', field: NESTED_GRAPH_FIELD, value: inner([graphNode({ id: 'result', node_type: 'end', label: 'Result' })]) }]);
    expect((nodeById('part').config.subgraph as Graph).nodes.map((n) => n.id)).toEqual(['result']);
    expect(nodeById('part').outputs.map((p) => p.name)).toEqual(['Result']);
    expect(store().isDirty()).toBe(false);

    // Code changed on disk: taken -- and what is on disk is saved by definition.
    store().takeDiskChanges([
      { node_id: 'count', field: 'code', value: 'function run() { return { total: 2 }; }' },
      { node_id: 'gone', field: 'code', value: 'ignored' },
    ]);
    expect(nodeById('count').config.code).toContain('total: 2');
    expect(store().isDirty()).toBe(false);
    store().undo();
    expect(nodeById('count').config.code).toContain('total: 1');

    // With unsaved work here (the undo left some), taking it would replace the whole graph without a word.
    const { refused } = store().takeDiskChanges([{ node_id: 'part', field: NESTED_GRAPH_FIELD, value: inner([graphNode({ id: 'theirs' })]) }]);
    expect(refused).toEqual(['part']);
    expect((nodeById('part').config.subgraph as Graph).nodes.map((n) => n.id)).toEqual(['result']);
  });
});

describe('a graph inside a node', () => {
  const holder = () => graphNode({
    id: 'part', node_type: 'subgraph', label: 'Part',
    config: { ...baseNodeConfig(), subgraph: { metadata: { name: 'Inner', description: '', gui_scheme: 'night' }, nodes: [], edges: [] } },
  });
  const held = () => (nodeById('part').config.subgraph as Graph).nodes;

  it('is opened in place of the one outside, is unsaved work like any other, and comes back as one undo step', () => {
    loadTestGraph([holder()]);
    store().markSaved();

    store().openSubgraph('part');
    expect(store().rfNodes).toHaveLength(0);
    expect(store().metadata.name).toBe('Inner');
    // Going in changes nothing; a change in there is a change of the whole document.
    expect(store().isDirty()).toBe(false);
    store().addNode('end', { x: 0, y: 0 });
    store().addNode('code', { x: 0, y: 0 });
    expect(store().isDirty()).toBe(true);
    store().closeSubgraph();

    // Back outside, the node holds what was built -- and an end point in there is an output port out here.
    expect(store().metadata.name).toBe('Test');
    expect(held()).toHaveLength(2);
    expect(nodeById('part').outputs).toHaveLength(1);
    // One Ctrl+Z took away everything built inside.
    store().undo();
    expect(held()).toHaveLength(0);
    store().redo();
    expect(held()).toHaveLength(2);
  });
});

describe('graphStore.connect', () => {
  it('names a new wire the way flow.json writes it, and draws none twice, whatever the one already there is called', () => {
    const nodes = () => [
      graphNode({ id: 'a', node_type: 'code', outputs: [port('out', 'output')] }),
      graphNode({ id: 'b', node_type: 'code', inputs: [port('in', 'input')] }),
    ];
    const wire = { source: 'a', sourceHandle: 'out', target: 'b', targetHandle: 'in' };
    loadTestGraph(nodes());
    store().connect(wire);
    expect(store().rfEdges.map((edge) => edge.id)).toEqual(['a.out -> b.in']);
    // A graph pasted in or designed by ✨ may call its wires anything.
    loadTestGraph(nodes(), [{ id: 'e1', source_node_id: 'a', source_port_id: 'out', target_node_id: 'b', target_port_id: 'in' }]);
    store().connect(wire);
    expect(store().rfEdges).toHaveLength(1);
  });

  it('sets what an input takes: files where a path arrives at a node that reads its files, and the part of a call it is named after', () => {
    const paths = { ...port('files', 'output'), data_type: 'file_path' as const, multi: true };
    loadTestGraph([
      graphNode({ id: 'folder', node_type: 'code', outputs: [paths] }),
      graphNode({ id: 'reader', node_type: 'code', inputs: [port('in', 'input')] }),
      graphNode({ id: 'memory', node_type: 'data', inputs: [port('input', 'input')] }),
      graphNode({ id: 'result', node_type: 'end', inputs: [port('value', 'input')] }),
      graphNode({
        id: 'ask', node_type: 'start', outputs: [port('data', 'output')],
        config: { ...baseNodeConfig(), started_by: 'call', values: { topic: 'cats', size: 3 } },
      }),
      graphNode({ id: 'say', node_type: 'code', inputs: [port('topic', 'input'), port('other', 'input')] }),
    ]);
    for (const [target, handle] of [['reader', 'in'], ['memory', 'input'], ['result', 'value']]) {
      store().connect({ source: 'folder', sourceHandle: 'files', target, targetHandle: handle });
    }
    expect(nodeById('reader').inputs[0]).toMatchObject({ data_type: 'file_path', multi: true });
    expect(nodeById('memory').inputs[0]).toMatchObject({ data_type: 'any', multi: false });
    // An end point hands back the paths, not their files -- a list of them, as one arrives.
    expect(nodeById('result').inputs[0]).toMatchObject({ data_type: 'any', multi: true });

    store().connect({ source: 'ask', sourceHandle: 'data', target: 'say', targetHandle: 'topic' });
    store().connect({ source: 'ask', sourceHandle: 'data', target: 'say', targetHandle: 'other' });
    expect(nodeById('say').inputs[0]).toMatchObject({ field: 'topic', data_type: 'text' });
    // Two parts, neither named after it: the whole package.
    expect(nodeById('say').inputs[1].field).toBeUndefined();
  });
});

describe('graphStore.connectToNewInput', () => {
  it('gives a wire dropped on a code node an input of its own, named after what arrives -- and undone, the input goes with its wire', () => {
    loadTestGraph([
      graphNode({ id: 'page', node_type: 'code', outputs: [port('select_out', 'output', 'Darstellung'), port('picker_out', 'output', 'Größe')] }),
      graphNode({ id: 'sum', node_type: 'code', inputs: [port('input', 'input')] }),
    ]);
    expect(store().connectToNewInput({ source: 'page', sourceHandle: 'select_out', target: 'sum' })).toBe(true);
    expect(store().connectToNewInput({ source: 'page', sourceHandle: 'picker_out', target: 'sum' })).toBe(true);
    expect(nodeById('sum').inputs.map((p) => [p.id, p.name])).toEqual([['input', 'input'], ['darstellung', 'Darstellung'], ['groesse', 'Größe']]);
    expect(store().rfEdges.map((edge) => edge.id)).toEqual(['page.select_out -> sum.darstellung', 'page.picker_out -> sum.groesse']);

    store().undo();
    expect(nodeById('sum').inputs.map((p) => p.id)).toEqual(['input', 'darstellung']);
    expect(store().rfEdges).toHaveLength(1);
  });
});
