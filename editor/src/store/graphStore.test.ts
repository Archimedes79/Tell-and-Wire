import { describe, it, expect, vi } from 'vitest';
import { besideTheRest, useGraphStore } from './graphStore';
import type { Graph, GraphNode } from '@/graph';
import { baseNodeConfig } from '@/document/baseNodeConfig';
import { WIDGET_BUILDERS } from '@/elements/registry';
import { NESTED_GRAPH_FIELD } from '@engine/project/changes.ts';
import { NODE_KINDS } from '@/document/nodeKinds';
import { registry as engineRegistry } from '@engine/elements/registry.ts';
import { parseGraph } from '@engine/graph.ts';
import { executeGraph } from '@engine/execution/executor.ts';
import { answers as runAnswers } from '../../test/engineAnswers';

// The same defaults every node type is created with. Copied out field by field
// here once, which meant adding a field to NodeConfig broke this file for a
// reason that had nothing to do with what it tests.
const blankConfig = baseNodeConfig;

function graphNode(overrides: Partial<GraphNode>): GraphNode {
  return {
    id: 'n',
    node_type: 'folder',
    label: 'Node',
    description: '',
    position: { x: 0, y: 0 },
    inputs: [],
    outputs: [],
    config: blankConfig(),
    ...overrides,
  };
}

function loadTestGraph(nodes: GraphNode[], edges: Graph['edges'] = [], page?: Graph['page']) {
  useGraphStore.getState().loadGraph({
    metadata: {
      name: 'Test', description: '',
      gui_scheme: 'night',
    },
    nodes,
    edges,
    ...(page ? { page } : {}),
  });
}

describe('graphStore.currentFilePath', () => {
  it('resets to null on loadGraph, and can be set explicitly by the caller afterward', () => {
    useGraphStore.getState().setCurrentFilePath('/tmp/example.json');
    expect(useGraphStore.getState().currentFilePath).toBe('/tmp/example.json');

    loadTestGraph([]);
    expect(useGraphStore.getState().currentFilePath).toBeNull();

    useGraphStore.getState().setCurrentFilePath('/tmp/loaded.json');
    expect(useGraphStore.getState().currentFilePath).toBe('/tmp/loaded.json');
  });
});

describe('graphStore.addNode', () => {
  it('marks the node it adds, and only that one: two lit nodes read as two selected', () => {
    useGraphStore.getState().newGraph();
    const first = useGraphStore.getState().addNode('code', { x: 0, y: 0 });
    const second = useGraphStore.getState().addNode('ai', { x: 300, y: 0 });
    expect(useGraphStore.getState().rfNodes.filter((node) => node.selected).map((node) => node.id)).toEqual([second]);
    expect(first).not.toBe(second);
  });
});

describe('graphStore.newGraph', () => {
  it('starts from the engine\'s defaults, keeping nothing of the graph before it', () => {
    // "New graph" used to merge a name and four other keys into the old
    // metadata: a colour scheme was saved into the new one, and Undo brought
    // the old graph's nodes back.
    loadTestGraph([graphNode({ id: 'old' })]);
    useGraphStore.getState().setMetadata({ gui_scheme: 'paper' });
    useGraphStore.getState().setCurrentFilePath('/tmp/old', true);
    useGraphStore.getState().setRFNodes([]);
    useGraphStore.getState().newGraph();
    const state = useGraphStore.getState();
    expect(state.metadata).toEqual(parseGraph({ nodes: [], edges: [] }).metadata);
    expect(state.rfNodes).toEqual([]);
    expect(state.past).toEqual([]);
    expect(state.currentFilePath).toBeNull();
    expect(state.isDirty()).toBe(false);
  });
});

describe('graphStore.updateNode edge pruning', () => {
  it('removes edges attached to ports no longer present after an update', () => {
    const port = (id: string) => ({ id, name: id, kind: 'output' as const, data_type: 'any' as const, multi: false, required: false, description: '' });
    const code = graphNode({ id: 'code1', node_type: 'code', outputs: [port('a'), port('b')] });
    const sink = graphNode({
      id: 'sink',
      node_type: 'end',
      inputs: [{ id: 'value', name: 'Value', kind: 'input', data_type: 'any', multi: true, required: false, description: '' }],
    });

    loadTestGraph(
      [code, sink],
      [
        { id: 'e1', source_node_id: 'code1', source_port_id: 'a', target_node_id: 'sink', target_port_id: 'value' },
        { id: 'e2', source_node_id: 'code1', source_port_id: 'b', target_node_id: 'sink', target_port_id: 'value' },
      ]
    );

    expect(useGraphStore.getState().rfEdges).toHaveLength(2);

    // Its outputs shrink to just "a".
    useGraphStore.getState().updateNode('code1', { outputs: [port('a')] });

    const remainingEdges = useGraphStore.getState().rfEdges;
    expect(remainingEdges).toHaveLength(1);
    expect(remainingEdges[0].id).toBe('e1');
  });

  it('leaves edges alone when the update does not touch ports', () => {
    const a = graphNode({ id: 'a', outputs: [{ id: 'output', name: 'Output', kind: 'output', data_type: 'text', multi: false, required: false, description: '' }] });
    const b = graphNode({
      id: 'b',
      node_type: 'end',
      inputs: [{ id: 'value', name: 'Value', kind: 'input', data_type: 'any', multi: true, required: false, description: '' }],
    });
    loadTestGraph([a, b], [{ id: 'e1', source_node_id: 'a', source_port_id: 'output', target_node_id: 'b', target_port_id: 'value' }]);

    useGraphStore.getState().updateNode('a', { label: 'Renamed' });

    expect(useGraphStore.getState().rfEdges).toHaveLength(1);
  });
});

describe('graphStore.loadGraph derived ports', () => {
  it('gives a start point the port the engine derives, whatever the file said', () => {
    const stale = graphNode({
      id: 'go',
      node_type: 'start',
      inputs: [{ id: 'stale_in', name: 'Stale', kind: 'input', data_type: 'any', multi: false, required: false, description: '' }],
      outputs: [],
    });

    loadTestGraph([stale]);

    const loaded = useGraphStore.getState().rfNodes[0].data.graphNode;
    expect(loaded.inputs).toEqual([]);
    expect(loaded.outputs.map((p) => p.id)).toEqual(['data']);
  });
});

describe('graphStore: the page', () => {
  const note = WIDGET_BUILDERS.text.create('note', 'Note');

  it('is loaded, kept beside the nodes and handed back as the graph has it -- none, for a page of no blocks', () => {
    loadTestGraph([], [], { blocks: [note] });
    expect(useGraphStore.getState().page).toEqual([note]);
    expect(useGraphStore.getState().exportGraph().page).toEqual({ blocks: [note] });
    expect(useGraphStore.getState().isDirty()).toBe(false);
    loadTestGraph([], [], { blocks: [] });
    expect(useGraphStore.getState().exportGraph()).not.toHaveProperty('page');
  });

  it('is a change to the document: unsaved, and one undo step', () => {
    loadTestGraph([]);
    useGraphStore.getState().setPage([note]);
    expect(useGraphStore.getState().isDirty()).toBe(true);
    useGraphStore.getState().undo();
    expect(useGraphStore.getState().page).toEqual([]);
    expect(useGraphStore.getState().isDirty()).toBe(false);
  });
});

/**
 * A graph written by hand, by the MCP server or by a model leaves keys out, and
 * the engine reads each missing one some way. Opening such a graph and saving
 * it must not change what it does: the editor used to fill a missing key with
 * what a *new* node starts with, and then save that. A code node with no
 * batch_mode ran once on the whole list from the command line and once per
 * item after one Save in the editor; an end point with no label came back
 * keyed "Result" instead of by its id.
 *
 * The mirror of `elements/savedConfig.test.ts`, asking the same questions
 * (`test/engineAnswers.ts`): that one holds a saved node to the full one, this
 * one holds a loaded node to the file it was loaded from.
 * Not `config()` itself: it spells a setting as it is stored, and a missing
 * provider and 'default' are one and the same provider to a run.
 */
describe('graphStore.loadGraph: a key the file leaves out', () => {
  const answers = (node: GraphNode) => runAnswers(node, ['config']);

  /** Each node type as a file might say it: its ports, and not one setting. */
  const bare = Object.values(NODE_KINDS).map((kind) => {
    const made = kind.create('n');
    return { ...made, config: {} as GraphNode['config'] };
  });

  it.each(bare.map((node) => [node.node_type, node]))(
    '%s: opened and saved, the engine runs it as the file said',
    (_type, node) => {
      loadTestGraph([node]);
      const saved = useGraphStore.getState().exportGraph().nodes[0];
      expect(answers(saved)).toEqual(answers(node));
    },
  );

  it('keeps a structure data node without a value holding nothing, not ""', () => {
    // The engine reads a missing value as null for a structure; filled from a
    // new node's '' it came back from one Save as a string.
    const node = { ...NODE_KINDS.data.create('n'), config: { data_format: 'structure' } as GraphNode['config'] };
    loadTestGraph([node]);
    const saved = useGraphStore.getState().exportGraph().nodes[0];
    expect(runAnswers(saved)).toEqual(runAnswers(node));
  });

  it('keeps two unlabelled outputs apart in the run\'s result, as the command line does', async () => {
    const text = (id: string, value: string) => ({ ...NODE_KINDS.data.create(id), outputs: [{ id: 'output', name: 'output', kind: 'output' as const, data_type: 'text' as const, multi: false, required: false, description: '' }], config: { data_value: value } as GraphNode['config'] });
    const show = (id: string) => ({ ...NODE_KINDS.end.create(id), config: {} as GraphNode['config'] });
    const file: Graph = {
      metadata: { name: 'T', description: '', gui_scheme: 'night' },
      nodes: [text('a', 'alpha'), text('b', 'beta'), show('first'), show('second')],
      edges: [
        { id: 'e1', source_node_id: 'a', source_port_id: 'output', target_node_id: 'first', target_port_id: 'value' },
        { id: 'e2', source_node_id: 'b', source_port_id: 'output', target_node_id: 'second', target_port_id: 'value' },
      ],
    };
    const run = async (graph: Graph) => Object.keys((await executeGraph(parseGraph(JSON.parse(JSON.stringify(graph))), {
      registry: engineRegistry,
      runtime: {
        files: { resolve: (path) => path, exists: async () => false, read: async () => '', write: async () => {}, list: async () => [] },
        code: { run: async () => ({}) },
        ai: { complete: async () => '' },
      },
    })).outputs).sort();

    useGraphStore.getState().loadGraph(file);
    expect(await run(useGraphStore.getState().exportGraph())).toEqual(await run(file));
  });

  it('starts a node made in the editor running once, and calls a new output "Result" -- which keys its value', () => {
    loadTestGraph([]);
    const code = useGraphStore.getState().addNode('code', { x: 0, y: 0 });
    const output = useGraphStore.getState().addNode('end', { x: 0, y: 0 });
    const saved = useGraphStore.getState().exportGraph().nodes;
    // Once, on what arrives: the default, so its file says nothing of it.
    expect(saved.find((node) => node.id === code)!.config).not.toHaveProperty('batch_mode');
    // The run's result, and nothing else: no window, no name beside its label.
    const made = saved.find((node) => node.id === output)!;
    expect(made.label).toBe('Result');
    expect(made.config).toEqual({});
  });

  it('writes "once per item" on no new node: each runs once until "Run once per item" is ticked', () => {
    // It used to be saved on every node, and an end point writing to a file
    // then wrote each item of a list over the last.
    loadTestGraph([]);
    const ids = (['ai', 'code', 'end', 'data', 'folder', 'subgraph', 'start'] as const)
      .map((type) => [type, useGraphStore.getState().addNode(type, { x: 0, y: 0 })] as const);
    const saved = useGraphStore.getState().exportGraph().nodes;
    const perItem = ids.filter(([, id]) => 'batch_mode' in saved.find((node) => node.id === id)!.config).map(([type]) => type);
    expect(perItem).toEqual([]);
  });

  it('labels each new end point its own way, as check asks', () => {
    // Two outputs sharing a label keep only the first under it, and `check` says so.
    loadTestGraph([graphNode({ id: 'kept', node_type: 'end', label: 'Result 2' })]);
    const labels = [0, 1, 2].map(() => useGraphStore.getState().addNode('end', { x: 0, y: 0 }))
      .map((id) => useGraphStore.getState().exportGraph().nodes.find((node) => node.id === id)!.label);
    expect(labels).toEqual(['Result', 'Result 3', 'Result 4']);
  });

  it('keeps what the file did say', () => {
    loadTestGraph([graphNode({ id: 'each', node_type: 'code', config: { batch_mode: 'per_item' } as GraphNode['config'] })]);
    expect(useGraphStore.getState().exportGraph().nodes[0].config.batch_mode).toBe('per_item');
  });
});

describe('graphStore.isDirty', () => {
  it('is asked on every tick of a run and frame of a drag, and serialises the document only when it changed', () => {
    loadTestGraph([graphNode({ id: 'a' })]);
    const store = () => useGraphStore.getState();
    store().isDirty();
    const serialised = vi.spyOn(JSON, 'stringify');
    try {
      for (let asked = 0; asked < 10; asked += 1) store().isDirty();
      useGraphStore.setState({ runProgress: { completed: 1, total: 2, label: 'a', itemDone: 0, itemTotal: 0, idleSeconds: null } });
      expect(store().isDirty()).toBe(false);
      expect(serialised).not.toHaveBeenCalled();
      store().updateNode('a', { label: 'Renamed' });
      serialised.mockClear();
      expect(store().isDirty()).toBe(true);
      expect(serialised).toHaveBeenCalled();
      store().undo();
      expect(store().isDirty()).toBe(false);
    } finally {
      serialised.mockRestore();
      useGraphStore.setState({ runProgress: null });
    }
  });
});

describe('graphStore.loadGraph: a node of a type this editor does not know', () => {
  it('opens the graph, and saves the node as it came, wires and all -- as the engine and a project folder keep it', () => {
    // Opening such a graph threw "Cannot read properties of undefined".
    const later = {
      id: 'later', node_type: 'vision', label: 'Later', description: 'A kind of a newer engine.', position: { x: 5, y: 6 },
      inputs: [{ id: 'picture', name: 'Picture', kind: 'input', data_type: 'image', multi: false, required: false, description: '' }],
      outputs: [], config: { batch_mode: 'whole_list', lens: 'wide' },
    } as unknown as GraphNode;
    const source = graphNode({ id: 'a', outputs: [{ id: 'output', name: 'Output', kind: 'output', data_type: 'text', multi: false, required: false, description: '' }] });
    loadTestGraph([source, later], [{ id: 'e1', source_node_id: 'a', source_port_id: 'output', target_node_id: 'later', target_port_id: 'picture' }]);
    const saved = useGraphStore.getState().exportGraph();
    expect(saved.nodes.find((node) => node.id === 'later')).toEqual(later);
    expect(saved.edges).toHaveLength(1);
    expect(useGraphStore.getState().isDirty()).toBe(false);
  });
});

describe('graphStore width/height persistence', () => {
  it('round-trips node size through loadGraph -> exportGraph', () => {
    const node = graphNode({ id: 'n1', width: 320, height: 240 });
    loadTestGraph([node]);

    // On `style`: that is what ReactFlow lays the node out from. A node's own
    // `width`/`height` are where it reports what it measured, so a size put
    // there is ignored and then overwritten.
    expect(useGraphStore.getState().rfNodes[0].style).toMatchObject({ width: 320, height: 240 });

    const exported = useGraphStore.getState().exportGraph();
    expect(exported.nodes[0].width).toBe(320);
    expect(exported.nodes[0].height).toBe(240);
  });
});

describe('graphStore: what a round remembered', () => {
  // What using a graph leaves behind is the server's session's, never the
  // document's (docs/architecture.md, "State"): a round's result is shown on
  // the canvas, and nothing of what it kept is written into the graph -- no
  // undo step, nothing to save, nothing Deploy would ship.
  it('shows what a round made, and keeps none of it in the document', () => {
    const chat = WIDGET_BUILDERS.chat.create('talk', 'Talk');
    loadTestGraph([graphNode({ id: 'data1', node_type: 'data', config: { ...blankConfig(), data_value: 'old value' } })], [], { blocks: [chat] });
    const before = useGraphStore.getState().exportGraph();
    const result = {
      status: 'success', node_results: [{ node_id: 'data1', status: 'success', inputs: {}, outputs: { output: 'new value' } }],
      memory: [{ node_id: 'data1', port_id: 'input', value: 'new value' }],
    };
    useGraphStore.getState().setExecutionResult(result as never);
    expect(useGraphStore.getState().executionResult).toBe(result);
    expect(useGraphStore.getState().exportGraph()).toEqual(before);
    expect(useGraphStore.getState().isDirty()).toBe(false);
  });
});

describe('graphStore, a project open on disk', () => {
  const codeNode = () => graphNode({
    id: 'count', node_type: 'code',
    outputs: [{ id: 'total', name: 'Total', kind: 'output', data_type: 'any', multi: false, required: false, description: '' }],
    config: { ...blankConfig(), code: 'function run() { return { total: 1 }; }' },
  });
  const nodeById = (id: string) => useGraphStore.getState().rfNodes.find((n) => n.id === id)!.data.graphNode;

  it('knows it is a project only while a path says so', () => {
    useGraphStore.getState().setCurrentFilePath('/work/tool', true);
    expect(useGraphStore.getState().isProject).toBe(true);
    loadTestGraph([]);
    expect(useGraphStore.getState().isProject).toBe(false);
    useGraphStore.getState().setCurrentFilePath('/work/tool.json');
    expect(useGraphStore.getState().isProject).toBe(false);
  });

  it('takes code changed on disk in as one undo step, and a clean graph stays clean', () => {
    loadTestGraph([codeNode()]);
    useGraphStore.getState().markSaved();

    useGraphStore.getState().takeDiskChanges([
      { node_id: 'count', field: 'code', value: 'function run() { return { total: 2 }; }' },
      { node_id: 'gone', field: 'code', value: 'ignored' },
    ]);
    expect(nodeById('count').config.code).toContain('total: 2');
    expect(useGraphStore.getState().isDirty()).toBe(false);

    useGraphStore.getState().undo();
    expect(nodeById('count').config.code).toContain('total: 1');
  });

  it('takes the page\'s blocks changed in its page.json, as one undo step, said as "page"', () => {
    loadTestGraph([], [], { blocks: [{ id: 'note', kind: 'text_io', label: 'Note', mode: 'output', w: 16, h: 2, tone: 'plain' }] });
    useGraphStore.getState().markSaved();
    const { taken } = useGraphStore.getState().takeDiskChanges([{
      node_id: null, field: 'blocks',
      value: [{ id: 'file', kind: 'input_picker', label: 'File', mode: 'file', w: 16, h: 2 }],
    }]);
    expect(taken).toEqual(['page']);
    expect(useGraphStore.getState().page.map((block) => block.id)).toEqual(['file']);
    expect(useGraphStore.getState().isDirty()).toBe(false);
    useGraphStore.getState().undo();
    expect(useGraphStore.getState().page.map((block) => block.id)).toEqual(['note']);
  });

  it('takes no undo step, and keeps Redo, when nothing that came from disk is taken', () => {
    // A change for a node that is gone, one that says what the node holds,
    // one left on disk: the step was taken before any of that was known.
    loadTestGraph([codeNode(), graphNode({ id: 'part', node_type: 'subgraph', config: { ...blankConfig(), subgraph: { metadata: { name: 'Inner' }, nodes: [], edges: [] } } })]);
    useGraphStore.getState().markSaved();
    useGraphStore.getState().updateNode('count', { label: 'Renamed' });
    useGraphStore.getState().updateNode('count', { label: 'Renamed again' });
    useGraphStore.getState().undo();
    const { past, future } = useGraphStore.getState();
    const { taken, refused } = useGraphStore.getState().takeDiskChanges([
      { node_id: 'gone', field: 'code', value: 'function run() {}' },
      { node_id: 'count', field: 'code', value: nodeById('count').config.code },
      { node_id: 'part', field: NESTED_GRAPH_FIELD, value: { metadata: { name: 'Inner' }, nodes: [graphNode({ id: 'theirs' })], edges: [] } },
    ]);
    // Nothing taken: a node gone, a change it held already, a graph left on disk.
    expect(taken).toEqual([]);
    expect(refused).toEqual(['part']);
    expect(useGraphStore.getState().past).toEqual(past);
    expect(useGraphStore.getState().future).toEqual(future);
    useGraphStore.getState().redo();
    expect(nodeById('count').label).toBe('Renamed again');
  });

  it('keeps unsaved edits unsaved when a change comes in from disk', () => {
    loadTestGraph([codeNode()]);
    useGraphStore.getState().markSaved();
    useGraphStore.getState().updateNode('count', { label: 'Renamed here' });
    useGraphStore.getState().takeDiskChanges([{ node_id: 'count', field: 'input_definition', value: 'module.exports = null;' }]);
    expect(useGraphStore.getState().isDirty()).toBe(true);
    expect(nodeById('count').label).toBe('Renamed here');
  });

  it('keeps nothing of a run in the node: what goes out is what its output.js says', () => {
    loadTestGraph([codeNode()]);
    const before = nodeById('count');
    useGraphStore.getState().setExecutionResult({
      status: 'success', outputs: {}, error: null,
      node_results: [{ node_id: 'count', status: 'success', inputs: {}, outputs: { total: 7 }, error: null }],
    });
    expect(nodeById('count')).toBe(before);
    expect(useGraphStore.getState().isDirty()).toBe(false);
  });
});

describe('graphStore, a graph just opened', () => {
  const store = () => useGraphStore.getState();
  /** What ReactFlow does once a node is drawn: it reports what the node measured. */
  const measured = (id: string, width: number, height: number) =>
    store().setRFNodes(store().rfNodes.map((n) => (n.id === id ? { ...n, width, height } : n)));

  const openSized = () => {
    loadTestGraph([graphNode({ id: 'count', node_type: 'code' }), graphNode({ id: 'notes', node_type: 'data', width: 340, height: 300 })]);
  };

  it('gives the canvas the size a node was saved with', () => {
    // In `style`, because that is what ReactFlow renders from. Put on the node
    // itself it was ignored and then overwritten by the measurement, so a node
    // saved at 340x300 opened at whatever its contents came to.
    openSized();
    expect(store().rfNodes.find((n) => n.id === 'notes')!.style).toMatchObject({ width: 340, height: 300 });
    expect(store().rfNodes.find((n) => n.id === 'count')!.style).toBeUndefined();
  });

  it('stays saved when the canvas measures its nodes', () => {
    // The bug this is here for: every project read as "unsaved" the moment it
    // was opened, because the measurement was written back into the graph. It
    // is not cosmetic -- `takeDiskChanges` refuses a nested subgraph from disk
    // unless the document is clean, so that path was dead from the first frame.
    openSized();
    measured('notes', 675, 366);
    measured('count', 212, 96);
    expect(store().isDirty()).toBe(false);
    const exported = store().exportGraph();
    expect(exported.nodes.find((n) => n.id === 'count')!.width).toBeUndefined();
    expect(exported.nodes.find((n) => n.id === 'notes')).toMatchObject({ width: 340, height: 300 });
  });
});

/**
 * Going into a node that holds a graph. One document is open at a time and the
 * canvas does not know the difference -- what changes is which graph it shows,
 * and that is the whole mechanism.
 */
describe('a graph inside a node', () => {
  const inner = (nodes: unknown[] = []) => ({
    metadata: {
      name: 'Inner', description: '',
      gui_scheme: 'night',
    },
    nodes,
    edges: [],
  });

  const holder = (held: unknown = inner()) => graphNode({
    id: 'part', node_type: 'subgraph', label: 'Part',
    config: { ...blankConfig(), subgraph: held },
  });

  const store = () => useGraphStore.getState();

  it('opens what the node holds, and puts back what was built in there', () => {
    loadTestGraph([holder()]);
    store().markSaved();

    store().openSubgraph('part');
    expect(store().rfNodes).toHaveLength(0);
    expect(store().metadata.name).toBe('Inner');

    store().addNode('end', { x: 0, y: 0 });
    store().closeSubgraph();

    // Back outside, with the node holding what was added -- and an end point
    // in there is an output port out here.
    expect(store().metadata.name).toBe('Test');
    const node = store().rfNodes[0].data.graphNode;
    expect((node.config.subgraph as Graph).nodes).toHaveLength(1);
    expect(node.outputs).toHaveLength(1);
  });

  it('is unsaved work like any other, measured on the whole document', () => {
    loadTestGraph([holder()]);
    store().markSaved();
    expect(store().isDirty()).toBe(false);

    store().openSubgraph('part');
    // Going in changes nothing.
    expect(store().isDirty()).toBe(false);

    store().addNode('end', { x: 0, y: 0 });
    // A change in there is a change, seen from in there.
    expect(store().isDirty()).toBe(true);

    // And saving from in there saves the whole thing.
    store().markSaved();
    expect(store().isDirty()).toBe(false);
    store().closeSubgraph();
    expect(store().isDirty()).toBe(false);
  });

  it('makes a start point added in there one the graph above starts, which an input wired from it takes without a word', () => {
    const made = (id: string) => store().rfNodes.find((n) => n.id === id)!.data.graphNode as GraphNode;
    loadTestGraph([holder()]);
    store().openSubgraph('part');
    const start = store().addNode('start', { x: 0, y: 0 });
    // Sent what reaches the port of its name, under its name.
    expect(made(start).config).toMatchObject({ started_by: 'call', values: { [start]: '' } });
    const code = store().addNode('code', { x: 0, y: 0 });
    store().connect({ source: start, sourceHandle: 'data', target: code, targetHandle: made(code).inputs[0].id });
    expect(made(code).inputs[0]).toMatchObject({ field: start, data_type: 'text' });
    store().closeSubgraph();
    // Out here it is a port of the node that holds it.
    expect(made('part').inputs.map((port) => port.id)).toEqual([start]);
  });

  it('makes a start point added at the top one the page starts, as ever', () => {
    loadTestGraph([]);
    const start = store().addNode('start', { x: 0, y: 0 });
    const config = (store().rfNodes.find((n) => n.id === start)!.data.graphNode as GraphNode).config;
    expect(config.started_by).toBe('page');
    expect(config.values).toBeUndefined();
  });

  it('gives each level its own undo, and lets neither reach the other', () => {
    loadTestGraph([holder()]);
    store().openSubgraph('part');
    expect(store().past).toHaveLength(0);

    store().addNode('end', { x: 0, y: 0 });
    expect(store().past.length).toBeGreaterThan(0);
    store().undo();
    expect(store().rfNodes).toHaveLength(0);

    store().closeSubgraph();
    // Outside, the history is the one that was left here.
    expect(store().past).toHaveLength(0);
    expect(store().rfNodes.map((n) => n.id)).toEqual(['part']);
  });

  it('folds every level up, however deep', () => {
    loadTestGraph([holder(inner([{ ...holder(), id: 'deeper', label: 'Deeper' }]))]);
    store().openSubgraph('part');
    store().openSubgraph('deeper');
    store().addNode('end', { x: 0, y: 0 });

    const root = store().rootGraph();
    const middle = root.nodes[0].config.subgraph as Graph;
    const bottom = middle.nodes[0].config.subgraph as Graph;
    expect(bottom.nodes).toHaveLength(1);
    // And what `rootGraph` says is what closing twice leaves behind.
    store().closeSubgraph();
    store().closeSubgraph();
    expect(JSON.stringify(store().exportGraph())).toBe(JSON.stringify(root));
  });

  it('takes the whole graph back when its folder changed on disk, ports and all', () => {
    loadTestGraph([holder()]);
    store().markSaved();

    // What the engine reports for a node whose folder changed: the graph it
    // holds, whole. An end point appeared in there while we were away.
    store().takeDiskChanges([{
      node_id: 'part',
      field: NESTED_GRAPH_FIELD,
      value: inner([graphNode({ id: 'result', node_type: 'end', label: 'Result' })]),
    }]);

    const node = store().rfNodes[0].data.graphNode;
    expect((node.config.subgraph as Graph).nodes.map((n) => n.id)).toEqual(['result']);
    // The ports follow the graph inside, here as everywhere else.
    expect(node.outputs.map((port) => port.name)).toEqual(['Result']);
    // What is on disk is saved by definition.
    expect(store().isDirty()).toBe(false);
  });

  it('makes everything done in there one step out here', () => {
    loadTestGraph([holder()]);
    store().openSubgraph('part');
    store().addNode('end', { x: 0, y: 0 });
    store().addNode('code', { x: 0, y: 0 });
    store().closeSubgraph();

    // One Ctrl+Z used to throw away everything built inside, because nothing
    // in there had ever been a step out here.
    expect(store().past.length).toBeGreaterThan(0);
    const built = (store().rfNodes[0].data.graphNode.config.subgraph as Graph).nodes.length;
    expect(built).toBe(2);
    store().undo();
    expect((store().rfNodes[0].data.graphNode.config.subgraph as Graph).nodes).toHaveLength(0);
    store().redo();
    expect((store().rfNodes[0].data.graphNode.config.subgraph as Graph).nodes).toHaveLength(2);
  });

  it('costs no undo step when nothing was changed in there', () => {
    loadTestGraph([holder()]);
    store().openSubgraph('part');
    store().closeSubgraph();
    expect(store().past).toHaveLength(0);
  });

  it('comes back out to the top, one level at a time', () => {
    loadTestGraph([holder(inner([{ ...holder(), id: 'deeper', label: 'Deeper' }]))]);
    store().openSubgraph('part');
    store().openSubgraph('deeper');
    store().closeSubgraphsTo(0);
    expect(store().subgraphStack).toHaveLength(0);
    expect(store().rfNodes.map((n) => n.id)).toEqual(['part']);
  });

  it('stops where a level will not close, rather than asking forever', () => {
    // A run in flight keeps the level it runs on open. Asked in a loop until
    // the stack is short enough, that loop never ended.
    loadTestGraph([holder()]);
    store().openSubgraph('part');
    useGraphStore.setState({ isExecuting: true });
    store().closeSubgraphsTo(0);
    expect(store().subgraphStack).toHaveLength(1);
    useGraphStore.setState({ isExecuting: false });
  });

  it('will not change level while a run is in flight', () => {
    loadTestGraph([holder()]);
    useGraphStore.setState({ isExecuting: true });
    store().openSubgraph('part');
    expect(store().subgraphStack).toHaveLength(0);
    useGraphStore.setState({ isExecuting: false });
  });

  it('leaves nothing of the level behind when it swaps', () => {
    loadTestGraph([holder()]);
    useGraphStore.setState({
      executionResult: { status: 'success', node_results: [{ node_id: 'part', status: 'success', inputs: {}, outputs: { x: 'from the level above' } }], outputs: {} },
    });
    store().openSubgraph('part');
    expect(store().executionResult).toBeNull();
  });

  it('leaves a graph changed on disk alone while there is unsaved work here', () => {
    loadTestGraph([holder()]);
    store().markSaved();
    store().addNode('end', { x: 0, y: 0 });   // unsaved work, out here

    const { refused } = store().takeDiskChanges([{
      node_id: 'part', field: NESTED_GRAPH_FIELD, value: inner([graphNode({ id: 'theirs' })]),
    }]);

    // Taking it would have replaced that whole graph without a word.
    expect(refused).toEqual(['part']);
    expect((store().rfNodes[0].data.graphNode.config.subgraph as Graph).nodes).toHaveLength(0);
  });

  it('drops the frames when a different document is opened', () => {
    loadTestGraph([holder()]);
    store().openSubgraph('part');
    loadTestGraph([graphNode({ id: 'other' })]);
    expect(store().subgraphStack).toHaveLength(0);
    expect(store().rootGraph().nodes.map((n) => n.id)).toEqual(['other']);
  });
});

describe('graphStore.connect', () => {
  const port = (id: string, kind: 'input' | 'output') => ({ id, name: id, kind, data_type: 'any' as const, multi: false, required: false, description: '' });
  const nodes = () => [
    graphNode({ id: 'a', node_type: 'code', outputs: [port('out', 'output')] }),
    graphNode({ id: 'b', node_type: 'code', inputs: [port('in', 'input')] }),
  ];

  it('names a new wire the way flow.json writes it', () => {
    loadTestGraph(nodes());
    useGraphStore.getState().connect({ source: 'a', sourceHandle: 'out', target: 'b', targetHandle: 'in' });
    expect(useGraphStore.getState().rfEdges.map((edge) => edge.id)).toEqual(['a.out -> b.in']);
  });

  it('does not draw a wire twice, whatever the one already there is called', () => {
    // A graph pasted in or designed by ✨ may call its wires anything.
    loadTestGraph(nodes(), [{ id: 'e1', source_node_id: 'a', source_port_id: 'out', target_node_id: 'b', target_port_id: 'in' }]);
    useGraphStore.getState().connect({ source: 'a', sourceHandle: 'out', target: 'b', targetHandle: 'in' });
    expect(useGraphStore.getState().rfEdges).toHaveLength(1);
  });

  it('ticks "Read the file at this path" where a path arrives -- on a node that reads its files, and nowhere else', () => {
    // A data node's input and an end point's value became file_path too, on
    // kinds that take a path as a path.
    const paths = { ...port('files', 'output'), data_type: 'file_path' as const, multi: true };
    loadTestGraph([
      graphNode({ id: 'folder', node_type: 'code', outputs: [paths] }),
      graphNode({ id: 'reader', node_type: 'code', inputs: [port('in', 'input')] }),
      graphNode({ id: 'memory', node_type: 'data', inputs: [port('input', 'input')] }),
      graphNode({ id: 'result', node_type: 'end', inputs: [port('value', 'input')] }),
    ]);
    const typed = (id: string) => (useGraphStore.getState().rfNodes.find((n) => n.id === id)!.data.graphNode as GraphNode).inputs[0];
    for (const [target, handle] of [['reader', 'in'], ['memory', 'input'], ['result', 'value']]) {
      useGraphStore.getState().connect({ source: 'folder', sourceHandle: 'files', target, targetHandle: handle });
    }
    expect(typed('reader')).toMatchObject({ data_type: 'file_path', multi: true });
    expect(typed('memory')).toMatchObject({ data_type: 'any', multi: false });
    // An end point hands back the paths, not their files -- a list of them, as one arrives.
    expect(typed('result')).toMatchObject({ data_type: 'any', multi: true });
  });

  /** A start point a call starts, sent *values* for example. */
  const called = (values: Record<string, unknown>) => graphNode({
    id: 'ask', node_type: 'start', outputs: [port('data', 'output')], config: { ...blankConfig(), started_by: 'call', values },
  });
  const inputOf = (id: string, port = 0) => (useGraphStore.getState().rfNodes.find((n) => n.id === id)!.data.graphNode as GraphNode).inputs[port];

  it('has an input wired from a start point a call starts take the part of its example it is named after, typed as it is', () => {
    loadTestGraph([called({ topic: 'cats', size: 3 }), graphNode({ id: 'say', node_type: 'code', inputs: [port('topic', 'input'), port('other', 'input')] })]);
    useGraphStore.getState().connect({ source: 'ask', sourceHandle: 'data', target: 'say', targetHandle: 'topic' });
    useGraphStore.getState().connect({ source: 'ask', sourceHandle: 'data', target: 'say', targetHandle: 'other' });
    expect(inputOf('say', 0)).toMatchObject({ field: 'topic', data_type: 'text' });
    // Two parts, neither named after it: the whole package, as before.
    expect(inputOf('say', 1).field).toBeUndefined();
  });

  it('has a folder node\'s path take the one part there is, and keep its type: its ports follow from its settings', () => {
    loadTestGraph([called({ chosen: 'docs' }), { ...NODE_KINDS.folder.create('list'), position: { x: 0, y: 0 } }]);
    useGraphStore.getState().connect({ source: 'ask', sourceHandle: 'data', target: 'list', targetHandle: 'path' });
    expect(inputOf('list')).toMatchObject({ id: 'path', field: 'chosen', data_type: 'file_path' });
    // And keeps it once its ports are derived again, as a save and a load do.
    useGraphStore.getState().loadGraph(useGraphStore.getState().exportGraph());
    expect(inputOf('list')).toMatchObject({ id: 'path', field: 'chosen' });
  });
});

describe('graphStore.connectToNewInput', () => {
  const port = (id: string, kind: 'input' | 'output', name = id) => ({ id, name, kind, data_type: 'any' as const, multi: false, required: false, description: '' });
  const inputsOf = (id: string) => (useGraphStore.getState().rfNodes.find((n) => n.id === id)!.data.graphNode as GraphNode).inputs;

  it('gives a wire dropped on a code node an input of its own, named after what arrives', () => {
    loadTestGraph([
      graphNode({ id: 'page', node_type: 'code', outputs: [port('select_out', 'output', 'Darstellung'), port('picker_out', 'output', 'Größe')] }),
      graphNode({ id: 'sum', node_type: 'code', inputs: [port('input', 'input')] }),
    ]);
    expect(useGraphStore.getState().connectToNewInput({ source: 'page', sourceHandle: 'select_out', target: 'sum' })).toBe(true);
    expect(useGraphStore.getState().connectToNewInput({ source: 'page', sourceHandle: 'picker_out', target: 'sum' })).toBe(true);
    expect(inputsOf('sum').map((p) => [p.id, p.name])).toEqual([['input', 'input'], ['darstellung', 'Darstellung'], ['groesse', 'Größe']]);
    expect(useGraphStore.getState().rfEdges.map((edge) => edge.id)).toEqual(['page.select_out -> sum.darstellung', 'page.picker_out -> sum.groesse']);
  });

  it('is named after the node it comes from where that node has one output', () => {
    // Rebuilt by hand: a judge wired from two reviewers got inputs "output"
    // and "output2", beside its own output "output".
    loadTestGraph([
      graphNode({ id: 'r1', node_type: 'ai', label: 'Scientific', outputs: [port('output', 'output', 'Output')] }),
      graphNode({ id: 'judge', node_type: 'ai', inputs: [port('prompt', 'input')], outputs: [port('output', 'output')] }),
    ]);
    useGraphStore.getState().connectToNewInput({ source: 'r1', sourceHandle: 'output', target: 'judge' });
    expect(inputsOf('judge').map((p) => [p.id, p.name])).toEqual([['prompt', 'prompt'], ['scientific', 'Scientific']]);
  });

  it('is one step: undone, the input goes with its wire', () => {
    // Rebuilt by hand: Ctrl+Z took the wire away and left the input it had made.
    loadTestGraph([
      graphNode({ id: 'a', node_type: 'code', inputs: [], outputs: [port('out', 'output')] }),
      graphNode({ id: 'sum', node_type: 'code', inputs: [port('input', 'input')] }),
    ]);
    useGraphStore.getState().connectToNewInput({ source: 'a', sourceHandle: 'out', target: 'sum' });
    useGraphStore.getState().undo();
    expect(inputsOf('sum').map((p) => p.id)).toEqual(['input']);
    expect(useGraphStore.getState().rfEdges).toHaveLength(0);
  });

  it('leaves a node whose inputs are not its own to name, and the node the wire starts at', () => {
    loadTestGraph([
      graphNode({ id: 'a', node_type: 'code', inputs: [], outputs: [port('out', 'output')] }),
      graphNode({ id: 'keep', node_type: 'data', inputs: [port('input', 'input')] }),
    ]);
    expect(useGraphStore.getState().connectToNewInput({ source: 'a', sourceHandle: 'out', target: 'keep' })).toBe(false);
    expect(useGraphStore.getState().connectToNewInput({ source: 'a', sourceHandle: 'out', target: 'a' })).toBe(false);
    expect(useGraphStore.getState().rfEdges).toHaveLength(0);
    expect(inputsOf('keep')).toHaveLength(1);
  });

  it('takes the place of the input the node was made with while nothing uses it -- and keeps one something does', () => {
    // Rebuilt by hand: a wire dropped on a new AI node left its empty
    // "prompt" standing beside the input the wire made.
    const fresh = (kind: 'ai' | 'code', id: string, x: number) => ({ ...NODE_KINDS[kind].create(id), position: { x, y: 0 } });
    const reviewer = graphNode({ id: 'r1', node_type: 'ai', label: 'Scientific', outputs: [port('output', 'output', 'Output')] });
    loadTestGraph([reviewer, fresh('ai', 'judge', 300), fresh('code', 'count', 600)]);
    useGraphStore.getState().connectToNewInput({ source: 'r1', sourceHandle: 'output', target: 'judge' });
    expect(inputsOf('judge').map((p) => p.id)).toEqual(['scientific']);
    // A second wire keeps the first: it is used now.
    useGraphStore.getState().connectToNewInput({ source: 'count', sourceHandle: 'output', target: 'judge' });
    expect(inputsOf('judge').map((p) => p.id)).toEqual(['scientific', 'code_1']);
    // Undone, the input it was made with is back.
    useGraphStore.getState().undo();
    useGraphStore.getState().undo();
    expect(inputsOf('judge').map((p) => p.id)).toEqual(['prompt']);

    // One its body reads, or wired, stays.
    useGraphStore.getState().updateNode('count', { config: { ...NODE_KINDS.code.create('count').config, code: 'function run(inputs) { return { output: inputs.input }; }' } });
    useGraphStore.getState().connectToNewInput({ source: 'r1', sourceHandle: 'output', target: 'count' });
    expect(inputsOf('count').map((p) => p.id)).toEqual(['input', 'scientific']);
    loadTestGraph([reviewer, fresh('code', 'sum', 300)], [{ id: 'w', source_node_id: 'r1', source_port_id: 'output', target_node_id: 'sum', target_port_id: 'input' }]);
    useGraphStore.getState().connectToNewInput({ source: 'r1', sourceHandle: 'output', target: 'sum' });
    expect(inputsOf('sum').map((p) => p.id)).toEqual(['input', 'scientific']);
  });
});

describe('where a node nobody placed goes', () => {
  const at = (x: number, y: number) => ({ id: 'n' + x + '_' + y, position: { x, y }, data: {} }) as never;

  it('goes to the right of the row, four to a row, then starts a row below', () => {
    // Rebuilt by hand: seven nodes in one row, and fit view no longer showed the first.
    expect(besideTheRest([])).toEqual({ x: 200, y: 120 });
    expect(besideTheRest([at(200, 120)])).toEqual({ x: 540, y: 120 });
    expect(besideTheRest([at(200, 120), at(540, 120), at(880, 120)])).toEqual({ x: 1220, y: 120 });
    const four = [at(200, 120), at(540, 120), at(880, 120), at(1220, 120)];
    expect(besideTheRest(four)).toEqual({ x: 200, y: 340 });
    expect(besideTheRest([...four, at(200, 340)])).toEqual({ x: 540, y: 340 });
  });
});
