// A GUI written whole, with the start and end points its blocks need.
//
// The designer connects each block as it is added (`frontend/editor/gui/guiWrite.ts`):
// what a block sends goes to the GUI's start point, one a person uses fires it,
// what it shows is an end point -- and a point the graph lacks is made. A model
// that writes a GUI and a graph in one piece leaves out the same things, more
// often than anything else: the input field with no start point to send to, the
// output with no end point to show. `completeGui` gives that GUI what the
// designer would have, so a tool said in words has its start and its end.

import type { Graph, GraphNode } from '../../graph/graph.ts';
import type { Kinds } from '../../graph/nodes/NodeDefinition.ts';
import { guiBlocks, parseWidget, widgetElement } from '../gui.ts';
import { RUN_PORT } from '../../graph/triggers.ts';
import { ERROR_PORT } from '../../graph/wiring.ts';
import { points } from '../authoring/gui.ts';

/** The first of *base*, *base*_2, *base*_3 ... that is not in *taken*. */
function free(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let n = 1; ; n += 1) {
    const id = n === 1 ? base : `${base}_${n}`;
    if (!used.has(id)) return id;
  }
}

const words = (id: string): string => {
  const spaced = id.replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
};

/**
 * Give the GUI of *graph* what it lacks, in place:
 * - a connection a block cannot make is taken off: a button "sends" to the start point it
 *   means to fire -- that is what it then fires --, a text that shows nothing "shows" nothing;
 * - a start or end point a block names (`sends_to`, `fires`, `shows`) that is no node of
 *   the graph is made, under that name;
 * - an input that sends nowhere sends to the start point the GUI starts -- or to the one it
 *   fires, or to one made for it -- and an output that shows nothing shows an end point no
 *   block shows yet, or one made for it;
 * - a start point the GUI starts that nothing fires is fired by the one block that sends to
 *   it, where that block can (with several, a button is the person's to add).
 * Points are made unwired and beside the graph; wiring them is the graph's author's.
 */
export function completeGui(graph: Graph, registry: Kinds): void {
  mendPortNames(graph);
  wireNamedOutputs(graph);
  wireFieldInputs(graph, registry);
  readFilesOfPathInputs(graph, registry);
  for (const stored of guiBlocks(graph)) {
    const widget = parseWidget(stored);
    const element = widgetElement(widget.kind);
    if (!element) continue;
    if (widget.sends_to.length && !element.sends(widget)) {
      if (element.event(widget) && !widget.fires) stored.fires = widget.sends_to[0];
      delete stored.sends_to;
    }
    if (widget.fires && !element.event(widget)) delete stored.fires;
    if (widget.shows && !element.showsEnd(widget)) delete stored.shows;
  }
  const blocks = guiBlocks(graph).flatMap((stored) => {
    const widget = parseWidget(stored);
    const element = widgetElement(widget.kind);
    return element ? [{ stored, widget, element }] : [];
  });
  if (!blocks.length) return;

  /** A start point or an end point, made beside the graph. */
  const make = (kind: 'start' | 'end', id: string, label: string): string => {
    const others = graph.nodes.filter((node) => node.node_type !== kind).map((node) => node.position.x);
    const x = kind === 'start' ? (others.length ? Math.min(...others) - 340 : 80) : (others.length ? Math.max(...others) + 340 : 420);
    const here = graph.nodes.filter((node) => node.node_type === kind).length;
    const node: GraphNode = {
      id, node_type: kind, label, description: '', position: { x, y: 120 + 140 * here },
      inputs: kind === 'end' ? [{ id: 'value', name: 'Value', kind: 'input', data_type: 'any', multi: false, required: false, description: '' }] : [],
      outputs: [], config: kind === 'start' ? { started_by: 'gui' } : {},
    };
    const derived = registry.node(kind)?.derivedPorts(node, registry);
    graph.nodes.push(derived ? { ...node, ...derived } : node);
    return id;
  };
  const ids = () => graph.nodes.map((node) => node.id);

  // What a block names that the graph does not have.
  for (const { widget, element } of blocks) {
    for (const name of new Set([...widget.sends_to, ...(widget.fires ? [widget.fires] : [])])) {
      if (!ids().includes(name) && (element.sends(widget) || element.event(widget))) make('start', name, words(name));
    }
    if (widget.shows && !ids().includes(widget.shows) && element.showsEnd(widget)) make('end', widget.shows, widget.label || words(widget.shows));
  }

  // What a block leaves unsaid.
  for (const { stored, widget, element } of blocks) {
    const { starts, ends } = points(graph, registry);
    if (element.sends(widget) && !widget.sends_to.length) {
      const guiStarts = [...starts].filter(([, by]) => by === 'gui').map(([name]) => name);
      let target: string | undefined = widget.fires && starts.has(widget.fires) ? widget.fires : undefined;
      if (!target && guiStarts.length <= 1) target = guiStarts[0] ?? make('start', free('start', ids()), 'Start');
      if (target) stored.sends_to = [target];
    }
    if (element.showsEnd(widget) && !widget.shows) {
      const shown = new Set(guiBlocks(graph).map((one) => one.shows));
      stored.shows = [...ends].find((end) => !shown.has(end)) ?? make('end', free('result', ids()), widget.label || 'Result');
    }
  }

  // What starts the graph: a start point the GUI starts, and nobody fires.
  const { starts } = points(graph, registry);
  for (const [name, by] of starts) {
    if (by !== 'gui' || guiBlocks(graph).some((stored) => stored.fires === name)) continue;
    const senders = blocks.filter(({ stored, element, widget }) => (stored.sends_to as unknown[] | undefined)?.includes(name) && !stored.fires && element.event(widget));
    if (senders.length === 1) senders[0].stored.fires = name;
  }
}

/** A port's name without its number: "categories" and "category" are one word. */
const oneOrMany = (id: string): string => id.toLowerCase().replace(/ies$/, 'y').replace(/s$/, '');

/**
 * A wire to or from a port its node does not have is pointed at the port it means, where exactly one port of that node is the same
 * word in the other number and is free: a model that declares the inputs "categories" and "urgencies" and wires to "category" and
 * "urgency" hands over a tool with two problems nobody who only says what the nodes do can read. A name that could mean two is left.
 */
function mendPortNames(graph: Graph): void {
  for (const edge of graph.edges) {
    const target = graph.nodes.find((node) => node.id === edge.target_node_id);
    if (target && !target.inputs.some((port) => port.id === edge.target_port_id)) {
      const wired = (id: string) => graph.edges.some((other) => other.target_node_id === target.id && other.target_port_id === id);
      const meant = target.inputs.filter((port) => oneOrMany(port.id) === oneOrMany(edge.target_port_id) && !wired(port.id));
      if (meant.length === 1) edge.target_port_id = meant[0].id;
    }
    const source = graph.nodes.find((node) => node.id === edge.source_node_id);
    if (source && !source.outputs.some((port) => port.id === edge.source_port_id)) {
      const meant = source.outputs.filter((port) => oneOrMany(port.id) === oneOrMany(edge.source_port_id));
      if (meant.length === 1) edge.source_port_id = meant[0].id;
    }
  }
}

/**
 * An input whose `field` names another node's output -- "extract_invoice.supplier" -- and has no wire is wired from that output, and
 * takes the whole of it: a model that writes a node's name where a key of a package belongs means a wire. Left as it was written,
 * the start point was wired to it (`wireFieldInputs`), and the node was handed what the whole tool was started with.
 */
function wireNamedOutputs(graph: Graph): void {
  for (const node of graph.nodes) {
    for (const port of node.inputs) {
      if (!port.field || graph.edges.some((edge) => edge.target_node_id === node.id && edge.target_port_id === port.id)) continue;
      const [from, out, ...more] = port.field.split('.');
      const source = graph.nodes.find((one) => one.id === from && one.id !== node.id);
      if (!source || !out || more.length || !source.outputs.some((one) => one.id === out)) continue;
      graph.edges.push({ id: `${from}.${out} -> ${node.id}.${port.id}`, source_node_id: from, source_port_id: out, target_node_id: node.id, target_port_id: port.id });
      port.field = undefined;
    }
  }
}

/**
 * An input that takes, of a start point's package, what a file or folder block sends -- the paths of the files -- is typed as
 * paths to read (`file_path`): a run reads each file and hands over its text. Left typed otherwise it is handed the paths
 * themselves, and a model asked to take supplier and amount out of "invoices/a_mueller.txt" answers with what it makes up --
 * a table that looks right and is not. A model that builds a graph names the field and forgets the type, or names a part
 * the block does not send ("folder.content", "folder.files"): a folder sends its list of paths, whole, under its id.
 */
function readFilesOfPathInputs(graph: Graph, registry: Kinds): void {
  for (const node of graph.nodes) {
    for (const port of node.inputs) {
      if (!port.field) continue;
      const from = graph.edges.find((edge) => edge.target_node_id === node.id && edge.target_port_id === port.id)?.source_node_id;
      const source = from ? graph.nodes.find((one) => one.id === from) : undefined;
      if (!source || !registry.node(source.node_type)?.takesPackage) continue;
      const [id, ...inside] = port.field.split('.');
      const block = guiBlocks(graph).find((stored) => stored.id === id);
      const widget = block ? parseWidget(block) : undefined;
      const sent = widget ? widgetElement(widget.kind)?.sends(widget) : undefined;
      if (!sent) continue;
      // A part it has none of: what it sends is a path, a text, a number -- not an object to take a key of.
      if (inside.length && !sent.keys && ['file_path', 'text', 'number', 'boolean'].includes(sent.type)) port.field = id;
      if (port.field.includes('.') || sent.type !== 'file_path') continue;
      port.data_type = 'file_path';
      // The files of a folder are items: each is read and handled on its own, and what the node hands on is the list of the
      // answers -- unless something else is already the list it runs over. A model that is told "every invoice" leaves the
      // setting at whole: the first file is handled, and the rest are not.
      const runsOver = node.inputs.some((other) => other !== port && other.multi);
      if (sent.list && registry.node(node.node_type)?.fansOut && !runsOver) {
        port.multi = true;
        (node.config as Record<string, unknown>).batch_mode = 'per_item';
        for (const out of node.outputs) if (out.id !== ERROR_PORT) out.multi = true;
      }
    }
  }
}

/**
 * An input that takes a part of a start point's package (`field`) and has no wire is wired from that start point -- the one
 * its node's gate is wired from, else the only one the GUI starts. A model that wires "data" to a node's gate ("start here")
 * and forgets the input leaves the node nothing to read: "nothing is wired to it", and a first tool with a problem.
 */
function wireFieldInputs(graph: Graph, registry: Kinds): void {
  const { starts } = points(graph, registry);
  const guiStarts = [...starts].filter(([, by]) => by === 'gui').map(([name]) => name);
  for (const node of graph.nodes) {
    for (const port of node.inputs) {
      if (!port.field || graph.edges.some((edge) => edge.target_node_id === node.id && edge.target_port_id === port.id)) continue;
      const gate = graph.edges.find((edge) => edge.target_node_id === node.id && edge.target_port_id === RUN_PORT && starts.has(edge.source_node_id));
      const from = gate?.source_node_id ?? (guiStarts.length === 1 ? guiStarts[0] : undefined);
      if (!from) continue;
      graph.edges.push({ id: `${from}.data -> ${node.id}.${port.id}`, source_node_id: from, source_port_id: 'data', target_node_id: node.id, target_port_id: port.id });
    }
  }
}
