import { describe, it, expect } from 'vitest';
import { GRAPH_SYSTEM } from './graphPrompt.ts';
import { parseGraph } from '../../graph/graph.ts';
import { registry } from '../../graph/nodes/registry.ts';
import { WIDGETS } from '../gui-editor/widgets/roster.ts';
import { widgetElement } from '../gui-editor/widgets/page.ts';
import { problemsIn } from '../app/project/check.ts';
import { FolderNodeRunner } from '../../graph/nodes/folder/FolderNodeRunner.ts';
import type { GraphNode } from '../../graph/graph.ts';

/**
 * What a graph is *wrong* without.
 *
 * The prompt used to describe only the document's shape, which is enough to
 * get a graph that parses and does nothing: the code went into a key no
 * element reads, and edges named ports a folder node never emits. These tests
 * hold the facts that fixed that against the code they describe, so the prompt
 * cannot quietly drift away from the engine it is teaching.
 */

/** The one worked document the prompt hands over, taken back out of it. */
function example(): unknown {
  const fenced = /```json\n([\s\S]*?)```/.exec(GRAPH_SYSTEM);
  expect(fenced, 'the prompt should carry one fenced example').toBeTruthy();
  return JSON.parse(fenced![1]);
}

describe('the graph prompt', () => {
  it('teaches an example that is itself a valid graph, its page connected to what the graph has', () => {
    // If the document we hand the model as correct is wrong, every graph
    // copied from it is wrong in the same way.
    expect(problemsIn(parseGraph(example()))).toEqual([]);
  });

  it('teaches an input to take one value of what a start point is sent, by its field', () => {
    const graph = parseGraph(example());
    const taking = graph.nodes.flatMap((node) => node.inputs).find((port) => port.field);
    expect(taking).toMatchObject({ id: 'csv', field: 'csv' });
    expect(GRAPH_SYSTEM).toContain('"field": "<block id>" hands it that block\'s value alone');
  });

  it('wires that example only to ports its elements really emit', () => {
    const graph = parseGraph(example());
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    for (const edge of graph.edges) {
      const source = byId.get(edge.source_node_id)!;
      const element = registry.node(source.node_type)!;
      // A derived-port element ignores what the document declares, so its real
      // ports are the ones to check against.
      const derived = element.derivedPorts(source, registry);
      const emitted = (derived ?? { outputs: source.outputs }).outputs.map((p) => p.id);
      expect(emitted, `${source.id} must really emit ${edge.source_port_id}`).toContain(edge.source_port_id);
    }
  });

  const folder = (): GraphNode => ({
    id: 'f', node_type: 'folder', label: '', description: '', position: { x: 0, y: 0 }, inputs: [], outputs: [], config: {},
  });

  it('names the derived port names the folder element actually produces', () => {
    for (const port of new FolderNodeRunner().derivedPorts(folder()).outputs) {
      expect(GRAPH_SYSTEM, `a folder node emits ${port.id}`).toContain(`"${port.id}"`);
    }
  });

  it('says which derived ports carry a number, not text', () => {
    // A port named without its type reads as text, and a graph built on that
    // reading adds "3" to "4" and gets "34". Every derived number port is
    // named with what it holds, so a folder's count is used as a count.
    const numbers = new FolderNodeRunner().derivedPorts(folder()).outputs.filter((port) => port.data_type === 'number');
    expect(numbers.map((port) => port.id)).toEqual(['count']);
    for (const port of numbers) {
      expect(GRAPH_SYSTEM, `${port.id} is said to be a number`).toContain(`"${port.id}" (a number`);
    }
  });

  it('names each derived port of a folder node with what it holds', () => {
    // Said from `derivedPorts`, so a type or a port changed there is changed here.
    const derived = new FolderNodeRunner().derivedPorts(folder());
    for (const port of [...derived.inputs, ...derived.outputs]) {
      const holds = { number: 'a number', file_path: port.multi ? 'a list of file paths' : 'a file path' }[port.data_type as string];
      expect(GRAPH_SYSTEM, port.id).toContain(`"${port.id}" (${holds}`);
    }
  });

  it('teaches one way into a graph: a start point, and no input node -- a constant is a data node', () => {
    expect(registry.nodeTypes()).not.toContain('input');
    expect(GRAPH_SYSTEM).toContain('A start point is the ONE way into a graph: there is no input node');
    expect(registry.node('folder')!.graphAuthorNote()).toContain('It reads no file, and it is no way into the graph');
  });

  /**
   * Asked for a CSV explainer, a small model typed the code node's input
   * "csv_text" as text -- the file's text, it meant -- and the node was handed
   * the path (gemini-flash-lite, 2026-10-03). A picker now sends the text
   * itself; which part an input takes is its field, said whatever it is called.
   */
  it('has the input that works on a picked file take its text by field, whatever it is called; its path only to name it', () => {
    expect(GRAPH_SYSTEM).toContain('"field" is "<picker id>.content", whatever the input is called');
    expect(GRAPH_SYSTEM).toMatch(/needs where the file is[^.]*takes "<picker id>\.path"/);
    expect(GRAPH_SYSTEM).toContain('"field": "<picker id>", is typed "file_path" and marked "multi"');
  });

  it('lists every block kind there is, each with what it says of itself', () => {
    // The kinds used to be a hand-kept list, which never learnt of the spacer.
    for (const element of WIDGETS) {
      const note = element.graphAuthorNote();
      expect(GRAPH_SYSTEM, element.widgetKind).toContain(`  - ${element.widgetKind}${note ? `: ${note}` : '\n'}`);
    }
    // The three modes a text box has, the default one included.
    expect(widgetElement('text_io')!.graphAuthorNote()).toMatch(/input .*output .*both/);
  });

  it('offers a block no code of its own: a drawing block shows an end point, a folder sends its listing', () => {
    for (const kind of ['plot_window', 'table', 'image_view'] as const) {
      const note = widgetElement(kind)!.graphAuthorNote()!;
      expect(note, kind).toMatch(/^shows the end point named in "shows"/);
      expect(note, kind).not.toMatch(/config\.code|transform/);
    }
    expect(GRAPH_SYSTEM).toContain('A block has no code of its own');
    expect(GRAPH_SYSTEM).not.toMatch(/selector|select_all_files/);
    // Choosing some of a folder's files is a code node, said where a folder is.
    for (const note of [registry.node('folder')!.graphAuthorNote()!, widgetElement('input_picker')!.graphAuthorNote()!]) {
      expect(note).toMatch(/extensions/);
      expect(note).toMatch(/recursive/);
    }
    expect(registry.node('folder')!.graphAuthorNote()).toContain('to keep only some of the files, wire a code node after it');
  });

  it('says a node is its label and its description, and where each kind keeps what it runs', () => {
    expect(GRAPH_SYSTEM).toContain('Every node is its label and its description');
    for (const type of ['code', 'ai']) expect(registry.node(type)!.graphAuthorNote(), type).toMatch(/^its description says in words what it does/);
    expect(registry.node('code')!.graphAuthorNote()).toContain('config.code holds it as JavaScript');
    expect(registry.node('ai')!.graphAuthorNote()).toContain('config.output_definition');
    // And the worked example does it: its code node says what it does in its description.
    const code = parseGraph(example()).nodes.find((node) => node.node_type === 'code')!;
    expect(code.description).toBe('Count the lines of the text.');
    expect(code.config.prompt).toBeUndefined();
  });

  it('says the page is no node, and nothing is wired to it: its blocks connect themselves by name', () => {
    expect(GRAPH_SYSTEM).toContain('"page": {"blocks": [...]} beside "nodes" and "edges" -- not a node, and nothing is wired to it');
    for (const connection of ['"sends_to"', '"fires"', '"shows"']) expect(GRAPH_SYSTEM).toContain(connection);
  });

  it('names every node type the registry knows, except the ones that say a graph is not built with them', () => {
    const silent: string[] = [];
    for (const type of registry.nodeTypes()) {
      const note = registry.node(type)!.graphAuthorNote();
      if (!note) { silent.push(type); continue; }
      expect(GRAPH_SYSTEM, `${type} is listed as valid`).toMatch(new RegExp(`Valid node_type values: [^.]*\\b${type}\\b`));
      expect(GRAPH_SYSTEM, `${type} says where its settings are`).toContain(`- ${type}: ${note}`);
    }
    // Deliberate, and pinned: a subgraph is a graph inside a node, built by hand. A new kind
    // that forgot its note would show up here instead of quietly missing from the prompt.
    expect(silent).toEqual(['subgraph']);
  });
});

describe('a graph that shows nothing', () => {
  /**
   * The complaint this came from: a generated graph computed its answer and
   * ended there, so running it showed a blank screen and the tool looked
   * broken. Ending in something visible is a rule, not a matter of taste.
   */
  it('is ruled out in words: an end point is the run\'s result, under its label, and opens no window', () => {
    expect(GRAPH_SYSTEM).toContain('must end in something a person can see');
    expect(GRAPH_SYSTEM).toContain('what arrives there is the run\'s result, shown to whoever ran the graph under the node\'s label');
    expect(GRAPH_SYSTEM).not.toMatch(/"window"|output_label/);
  });

  it('and the worked example obeys its own rule', () => {
    const graph = parseGraph(example());
    const sources = new Set(graph.edges.map((e) => e.source_node_id));
    const ends = graph.nodes.filter((n) => !sources.has(n.id));
    expect(ends.length).toBeGreaterThan(0);
    for (const node of ends) {
      expect(node.node_type, `${node.id} ends a branch`).toBe('end');
    }
  });
});
