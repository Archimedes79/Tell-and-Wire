import { beforeAll, beforeEach, describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { useGraphStore } from './store/graphStore';
import type { Graph, GraphNode, GuiWidget, NodeType, Port, WidgetKind } from './graph';
import { withPorts } from '../graph-editor/canvas/nodeDraft';
import { nodePanel } from '../graph-editor/canvas/nodePanel';
import { newBlock } from '../gui-editor/page/DesignerPalette';
import { insertBlock, patchBlock } from '../gui-editor/page/pageWrite';
import { ONCE } from '../graph-editor/nodes/NodeGuiBuilder';
import { listPorts, withPerItem } from '../graph-editor/authoring/perItem';
import { heldBy, writeName, writtenInto, type Write } from '../graph-editor/authoring/generation';
import { definitionExample } from '../../graph/authoring/definition.ts';
import { Session } from '../../backend/gui-editor/session.ts';
import { registry } from '../../graph/nodes/registry.ts';
import { problemsIn } from '../../backend/app/project/check.ts';
import { readProject } from '../../backend/app/project/folder.ts';
import { filePorts } from '../../graph/execution/fileInputs.ts';
import { parseGraph } from '../../graph/graph.ts';
import type { Runtime } from '../../graph/nodes/Runtime.ts';

/**
 * The three master examples, built by hand.
 *
 * A plotter, a folder of summaries, a chat: each is a page, a start point,
 * one node and an end point, and each is put together here the way a person
 * puts it together -- blocks added to the page (each connects itself: what it
 * sends to the page's start point, a display to an end point), a node dropped
 * on the canvas, its text typed and its ✨ pressed in its panel, and a wire
 * dragged from one port to another -- what an input takes of the start
 * point's package following from the wire, as the port editor's "takes" box
 * then shows it. No mouse, no browser, and no copy of
 * what the editor's handlers do: a block comes from the palette's `newBlock`
 * and reaches the page through `insertBlock` and `patchBlock`, a node's panel
 * is its own `nodePanel` -- changed as its ports editor and its fields change
 * it, and what ✨ brings back written in by `writtenInto`, as the panel writes
 * it -- and a wire is the store's `connect`: the functions the designer and
 * the node panel call. What ✨ brings back is the example's own files, so no
 * model is asked; what stays in the components -- which row was clicked -- is
 * left out.
 *
 * Then three questions, of each:
 *   - is what was built sound (`check` finds nothing)?
 *   - is it *the example*: the same blocks connected the same way, the same
 *     wires, as the folder in `examples/` that people open first?
 *   - does it work: used on a file, a folder, a message, does the page show it?
 *
 * The second is what keeps the examples honest. An example somebody can open
 * but could not have built -- a port type no panel sets, a wire no handle
 * offers -- is a trick, and this is where it is caught.
 */

/** The examples as the backend reads their folders: the flow, each node's settings and ports, its files, and the page. */
const EXAMPLES: Record<string, Graph> = {};
beforeAll(async () => {
  for (const name of ['population_plotter', 'folder_summaries', 'chat']) {
    EXAMPLES[name] = await readProject(fileURLToPath(new URL(`../../examples/${name}`, import.meta.url))) as unknown as Graph;
  }
});
const example = (name: string): Graph => EXAMPLES[name];
/** One of an example's nodes, as its folder holds it. */
const exampleNode = (name: string, id: string): GraphNode => EXAMPLES[name].nodes.find((node) => node.id === id)!;
/** What ✨ wrote for *id* in an example: its input.js, its output.js and its body, as the node's files hold them. */
const writtenFor = (name: string, id: string): Partial<Record<Write, string>> => {
  const node = exampleNode(name, id);
  return { input: heldBy(node, 'input'), output: heldBy(node, 'output'), body: heldBy(node, 'body') };
};

// ── What a person does ────────────────────────────────────────────────────

const store = () => useGraphStore.getState();
const nodeOf = (id: string): GraphNode => store().rfNodes.find((node) => node.id === id)!.data.graphNode as GraphNode;
const blockOf = (id: string): GuiWidget => store().page.find((block) => block.id === id)!;

/** Drop a node on the canvas. */
const drop = (type: NodeType, x: number): string => store().addNode(type, { x, y: 160 });

/**
 * Add a block to the page from the palette, then set what its panel sets: the
 * designer's own steps (`newBlock`, `insertBlock`, then `patchBlock`).
 */
function addBlock(kind: WidgetKind, mode: string | undefined, settings: Partial<GuiWidget>): string {
  const block = newBlock(kind, mode, store().page);
  insertBlock(block);
  patchBlock(block.id, settings);
  return block.id;
}

/** The start point a block sends to, as it connected itself. */
const startOf = (blockId: string): string => blockOf(blockId).sends_to?.[0] ?? blockOf(blockId).fires!;
/** The end point a block shows, as it connected itself. */
const endOf = (blockId: string): string => blockOf(blockId).shows!;

/**
 * Open a node's panel and do what it asks: its heading and its text, what
 * its inputs are called (its ports, under Advanced), a ✨ pressed for each of
 * its files -- *written*, what came back, written in as the panel writes it:
 * output.js names its outputs. *needed* ticks "needed" on those inputs
 * (`PortsEditor`), which sets `required` on the port.
 *
 * Done through the panel's own `nodePanel`: each change as its ports editor
 * and its fields make it, and written into the graph as it writes -- closed.
 */
function edit(nodeId: string, changes: {
  label: string; text: string; input?: string[]; written: Partial<Record<Write, string>>; needed?: string[];
}): void {
  const panel = nodePanel(nodeId);
  // A row renamed in the ports editor; past the last row, one added with + and then named.
  const renamed = (ports: Port[], names: string[], kind: Port['kind']) => names.map((name, index) => ({
    ...(ports[index] ?? { kind, data_type: 'any', multi: false, required: false, description: '' }), id: name, name,
  }));
  panel.change((draft) => withPorts(draft, {
    inputs: (changes.input ? renamed(draft.inputs, changes.input, 'input') : draft.inputs)
      .map((port) => (changes.needed?.includes(port.id) ? { ...port, required: true } : port)),
    outputs: draft.outputs,
  }));
  panel.change((draft) => ({ ...draft, label: changes.label }));
  panel.change((draft) => ({ ...draft, description: changes.text }), { field: 'description' });
  for (const write of ['input', 'output', 'body'] as const) {
    const result = changes.written[write];
    if (!result) continue;
    panel.change((now) => writtenInto(now, write, { result, calls: [] }, writeName(now, write)), ONCE);
  }
  panel.write();
}

/**
 * Tick "Run once per item" in a node's panel, which sets how the node runs and
 * which inputs fan out and which outputs hand on a list, together
 * (`withPerItem`), for the lists that arrive. A new code or ai node runs once,
 * on what arrives whole, and the box is there only once a list arrives: here
 * down the wire from a folder, so it is ticked after that is drawn.
 */
function tickPerItem(nodeId: string): void {
  const panel = nodePanel(nodeId);
  const shown = panel.node()!;
  const read = definitionExample(String(shown.config.input_definition ?? ''));
  const lists = listPorts(shown, 'example' in read ? read.example : undefined, store().rfNodes.map((item) => item.data.graphNode), store().rfEdges);
  expect(lists.length).toBeGreaterThan(0);
  panel.change((draft) => withPerItem(draft, true, lists));
  panel.write();
}

/** Drag a wire from one handle to another. */
const wire = (source: string, sourceHandle: string, target: string, targetHandle: string): void =>
  store().connect({ source, sourceHandle, target, targetHandle });

// ── What is compared, and what runs ───────────────────────────────────────

/**
 * A graph as its shape: ids are made up on the spot, so nodes are named by
 * their type, blocks by their kind and how they connect, wires by what they
 * join -- and what an input takes of a package by the kind of block it is.
 */
function shapeOf(graph: Graph) {
  const type = (id: string | null | undefined): string => graph.nodes.find((node) => node.id === id)?.node_type ?? `(${id})`;
  const blocks = graph.page?.blocks ?? [];
  const kindOf = new Map(blocks.map((block) => [block.id, block.kind]));
  const part = (field: string): string => {
    const [id, ...rest] = field.split('.');
    return [kindOf.get(id) ?? id, ...rest].join('.');
  };
  return {
    nodes: graph.nodes.map((node) => node.node_type).sort(),
    blocks: blocks.map((block) => [
      `${block.kind}${block.mode ? `/${block.mode}` : ''}`,
      ...(block.sends_to ?? []).map((id) => `sends to ${type(id)}`),
      ...(block.fires ? [`fires ${type(block.fires)}`] : []),
      ...(block.shows ? [`shows ${type(block.shows)}`] : []),
    ].join(' ')),
    wires: graph.edges.map((edge) => `${type(edge.source_node_id)}.${edge.source_port_id} -> ${type(edge.target_node_id)}.${edge.target_port_id}`).sort(),
    // What each input takes of the package its start point hands on, as what.
    takes: graph.nodes.flatMap((node) => node.inputs.filter((port) => port.field)
      .map((port) => `${node.node_type}.${port.id} takes ${part(port.field!)} as ${port.data_type}${port.multi ? ' list' : ''}`)).sort(),
    // Which inputs a node will not run without, once they are wired: its ports' "needed".
    needed: graph.nodes.flatMap((node) => node.inputs.filter((port) => port.required).map((port) => `${node.node_type}.${port.id}`)).sort(),
    // How each node that authors a body takes a list: what "Run once per item" sets, as a run reads it.
    lists: graph.nodes.filter((node) => node.node_type === 'code' || node.node_type === 'ai')
      .map((node) => `${node.node_type} ${registry.node(node.node_type)!.batchMode(node as never)}: ${node.inputs.filter((port) => port.multi).map((port) => port.id).join(', ') || 'none fan out'}`).sort(),
  };
}

const FILES: Record<string, string> = {
  'data/population.csv': 'Country,Population\nChina,1419\nIndia,1450\nIndonesia,283',
  'stories/a.txt': 'The Lighthouse. A keeper counts ships for thirty-one years.',
  'stories/b.txt': 'The Map. A cartographer leaves one valley blank on purpose.',
};

/** A runtime, with a disk of three files, bodies run in this process, and a model that says what it was asked. */
function runtime(asked: string[]): Runtime {
  return {
    files: {
      resolve: (path) => path, exists: async (path) => path in FILES,
      read: async (path) => { if (!(path in FILES)) throw new Error(`no such file: ${path}`); return FILES[path]; },
      write: async () => {}, list: async (path) => Object.keys(FILES).filter((file) => file.startsWith(`${path}/`)).sort(),
    },
    code: { run: async (body, inputs) => new Function('inputs', `${body}; return run(inputs);`)(inputs) as Record<string, unknown> },
    // Its answer as the ai node's output.js asks for it: one output that holds text, answered in plain text.
    ai: { complete: async (request) => { asked.push(request.prompt); return `answer ${asked.length}`; } },
  };
}

/** The graph in use, as the server holds it for a page: a session -- of a copy, the store's graph is frozen. */
const use = (graph: Graph, asked: string[]) => Session.open(parseGraph(JSON.parse(JSON.stringify(graph))), { runtime: () => runtime(asked) });

/** Block *by* used on the page: a round at the start point it fires, sent what the page set. */
async function used(graph: Graph, by: string, values: Record<string, unknown> = {}, asked: string[] = []) {
  const session = await use(graph, asked);
  const result = await session.run({ node_id: blockOf(by).fires!, port_id: 'data' }, { values, by });
  return { result, asked, shown: session.view().shown, session };
}

beforeEach(() => {
  store().loadGraph({
    metadata: { name: 'Built by hand', description: '', gui_scheme: 'night' },
    nodes: [], edges: [],
  });
});

describe('population plotter: choose a CSV, see the chart', () => {
  const build = () => {
    // Alone on the page, picking a file is what starts it: no setting to make.
    const file = addBlock('input_picker', 'file', { label: 'CSV file', extensions: '.csv', value: 'data/population.csv' });
    const plot = addBlock('plot_window', undefined, { label: '' });
    const chart = drop('code', 560);
    edit(chart, {
      label: 'What to plot', text: exampleNode('population_plotter', 'chart').description, input: ['csv'],
      written: writtenFor('population_plotter', 'chart'),
    });
    // The picker's content: what a node takes of a file when nobody said.
    wire(startOf(file), 'data', chart, 'csv');
    wire(chart, 'figure', endOf(plot), 'value');
    return { graph: store().rootGraph(), file, plot };
  };

  it('can be built by hand, is sound, and is the example', () => {
    const { graph } = build();
    expect(problemsIn(parseGraph(graph))).toEqual([]);
    expect(shapeOf(graph)).toEqual(shapeOf(example('population_plotter')));
  });

  it('draws the file that is chosen: the code is handed the file\'s text, as the picker sends it', async () => {
    const { graph, file, plot } = build();
    const { result, shown } = await used(graph, file);
    expect(result.status).toBe('success');
    expect(shown[plot]).toMatchObject({ kind: 'bars', title: 'Population by Country', points: [{ label: 'India', value: 1450 }, { label: 'China', value: 1419 }, { label: 'Indonesia', value: 283 }] });
  });
});

describe('summarize a folder: choose a folder, read the summaries', () => {
  const build = () => {
    const folder = addBlock('input_picker', 'directory', { label: 'Folder', extensions: '.txt', value: 'stories' });
    const summaries = addBlock('text_io', 'output', { label: 'Summaries' });
    const summarize = drop('ai', 560);
    edit(summarize, {
      label: 'Each file', text: exampleNode('folder_summaries', 'summarize').description, input: ['story'],
      written: writtenFor('folder_summaries', 'summarize'),
    });
    wire(startOf(folder), 'data', summarize, 'story');
    tickPerItem(summarize);
    wire(summarize, 'output', endOf(summaries), 'value');
    return { graph: store().rootGraph(), folder, summaries };
  };

  it('can be built by hand, is sound, and is the example', () => {
    const { graph } = build();
    expect(problemsIn(parseGraph(graph))).toEqual([]);
    expect(shapeOf(graph)).toEqual(shapeOf(example('folder_summaries')));
  });

  it('asks once per file, with the file\'s text, and shows every summary in the one box', async () => {
    const { graph, folder, summaries } = build();
    const { result, asked, shown } = await used(graph, folder);
    expect(result.status).toBe('success');
    expect(asked).toEqual([FILES['stories/a.txt'], FILES['stories/b.txt']]);
    expect(shown[summaries]).toEqual(['answer 1', 'answer 2']);
  });
});

describe('chat: a page with a chat block, and a model', () => {
  const build = () => {
    const chat = addBlock('chat', undefined, {});
    const assistant = drop('ai', 560);
    edit(assistant, {
      label: 'Assistant', text: exampleNode('chat', 'assistant').description, input: ['history', 'message'],
      written: writtenFor('chat', 'assistant'), needed: ['message'],
    });
    // Each input takes the part of the chat it is named after.
    wire(startOf(chat), 'data', assistant, 'message');
    wire(startOf(chat), 'data', assistant, 'history');
    wire(assistant, 'output', endOf(chat), 'value');
    return { graph: store().rootGraph(), chat };
  };

  it('can be built by hand, is sound, and is the example', () => {
    const { graph } = build();
    expect(problemsIn(parseGraph(graph))).toEqual([]);
    expect(shapeOf(graph)).toEqual(shapeOf(example('chat')));
  });

  it('answers a message, and remembers the turn for the next one -- in the session, not in the document', async () => {
    const { graph, chat } = build();
    const asked: string[] = [];
    // What the server does with what the page sends: the message under the chat's id, the round its start point's.
    const session = await use(graph, asked);
    const say = async (text: string) => {
      const result = await session.run({ node_id: blockOf(chat).fires!, port_id: 'data' }, { values: { [chat]: text }, by: chat });
      expect(result.status).toBe('success');
    };
    await say('Hello there');
    await say('And again');
    // Each input under its port id, after the instructions: the history empty the first time.
    expect(asked[0]).toBe('history:\n\n\nmessage:\nHello there');
    expect(asked[1]).toContain('User: Hello there');
    expect(asked[1]).toContain('Assistant: answer 1');
    expect(asked[1].endsWith('message:\nAnd again')).toBe(true);
    // Both turns are the session's; the block in the document is as it was built.
    expect((session.view().page[chat] as { messages: unknown[] }).messages).toHaveLength(4);
    expect(blockOf(chat).value).toEqual(graph.page!.blocks.find((block) => block.id === chat)!.value);
  });
});

describe('a wire from a start point a picker sends to', () => {
  it('makes the input it ends on take the file\'s text, so nobody has to say it twice', () => {
    const file = addBlock('input_picker', 'file', { label: 'File' });
    const code = drop('code', 560);
    expect(nodeOf(code).inputs[0].data_type).toBe('any');
    wire(startOf(file), 'data', code, nodeOf(code).inputs[0].id);
    expect(nodeOf(code).inputs[0]).toMatchObject({ field: `${file}.content`, data_type: 'text' });
    // The same wire twice is one wire.
    wire(startOf(file), 'data', code, nodeOf(code).inputs[0].id);
    expect(store().rfEdges).toHaveLength(1);
  });

  /**
   * Every kind a person wires a folder into starts out saying nothing about
   * what it carries, and that is what lets the wire say it: the folder's
   * files, a list of paths, each read where it arrives -- which is all the
   * run asks (`execution/fileInputs.ts`).
   */
  it.each(['code', 'ai'] as const)('%s: a folder\'s files reach it as their text', (kind) => {
    const folder = addBlock('input_picker', 'directory', { label: 'Folder' });
    const node = drop(kind, 560);
    expect(nodeOf(node).inputs[0].data_type).toBe('any');
    wire(startOf(folder), 'data', node, nodeOf(node).inputs[0].id);
    expect(nodeOf(node).inputs[0]).toMatchObject({ field: folder, data_type: 'file_path', multi: true });
    expect(filePorts(nodeOf(node), registry)).toEqual([nodeOf(node).inputs[0].id]);
  });
});
