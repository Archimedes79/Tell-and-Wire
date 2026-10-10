// What is wrong with a graph.
//
// One list of problems for every reader: `node backend/app/main.ts check`
// prints it and fails a CI job on it, the MCP server hands it to a model before
// saving, the editor shows it before it loads a graph from outside, and each
// entry says where, what, and how to fix it -- the reader may be a person or a
// model, and both fix what they are told precisely. It reads no disk, so the
// page can ask it; what only a project folder gets wrong is `folderCheck.ts`.

import type { Graph, GraphEdge, GraphNode } from '../../../graph/graph.ts';
import { NESTING_LIMIT, fieldOf } from '../../../graph/execution/executor.ts';
import { memoryReads, topologicalLevels } from '../../../graph/execution/order.ts';
import { RUN_PORT } from '../../../graph/execution/triggers.ts';
import { fieldSender, pageProblems, showsMemory, widgetElement } from '../../gui-editor/widgets/page.ts';
import { ERROR_PORT, names, wiringProblems, type Problem } from '../../../graph/execution/wiring.ts';
import { registry } from '../../../graph/nodes/registry.ts';
import { resultKeys } from '../../../graph/nodes/NodeRunner.ts';
import { portMisfit } from '../../../graph/execution/interface.ts';
import { definitionExample } from '../../../graph/authoring/definition.ts';
import { unsavableIds } from './flow.ts';

export { type Problem } from '../../../graph/execution/wiring.ts';

/** The nodes a cycle is made of: whatever is left once everything with a free end is taken away. */
function knot(graph: Graph, reads: Set<string>): string[] {
  const left = new Set(graph.nodes.map((node) => node.id));
  for (let changed = true; changed;) {
    changed = false;
    const live = graph.edges.filter((edge) => !reads.has(edge.id)
      && left.has(edge.source_node_id) && left.has(edge.target_node_id));
    for (const id of [...left]) {
      if (live.some((edge) => edge.target_node_id === id) && live.some((edge) => edge.source_node_id === id)) continue;
      left.delete(id);
      changed = true;
    }
  }
  return [...left];
}

/**
 * Everything that would make *graph* parse, open, and then not work.
 *
 * These are the mistakes a model actually makes, and each one is silent at run
 * time: an edge to a port that does not exist delivers nothing and fails
 * nothing; a graph ending in a code node computes the answer and shows nobody.
 * So they are found here, by name, with the repair spelled out -- the reader is
 * a model, and a model fixes what it is told precisely.
 */
export function problemsIn(graph: Graph, inside = '', depth = 0): Problem[] {
  // First: with these wrong, a run refuses to start (see wiring.ts), or a save.
  const problems: Problem[] = [...wiringProblems(graph, registry), ...unsavableIds(graph)].map((problem) => within(problem, inside));

  for (const node of graph.nodes) {
    const where = `${inside}node "${node.id}"`;
    const element = registry.node(node.node_type);
    if (!element) {
      problems.push({
        where,
        problem: `Unknown node_type "${node.node_type}".`,
        fix: `Use one of: ${registry.nodeTypes().join(', ')}. Anything else -- a merge, a split, a filter -- is a "code" node.`,
      });
      continue;
    }

    // A node is its heading and its text: the canvas, its panel and every ✨
    // call it by the one, and what ✨ writes -- its definitions, its body -- is
    // written from the other. Neither is optional.
    if (!node.label.trim()) {
      problems.push({
        where,
        problem: 'It has no heading.',
        fix: 'Give it one (its "label"): a few words saying what it does -- the canvas, its panel and every ✨ call it by that.',
      });
    }
    if (element.generation() && !node.description.trim()) {
      problems.push({
        where,
        problem: 'Its text is empty: nothing says what it should do, and what ✨ writes for it is written from that text.',
        fix: 'Write its text (its "description"): what it should do, in words.',
      });
    }

    // A setting that silently does nothing: "once per item" fans out over the inputs
    // declared as lists. With none, the node runs once, on the whole list, and
    // nothing says it was asked to do otherwise. Only where a list really
    // arrives: on a node no list reaches, "once per item" means nothing.
    const listArrives = graph.edges.some((edge) => {
      if (edge.target_node_id !== node.id) return false;
      // Of what a start point is sent: a list where the block it names sends one, whole.
      const field = node.inputs.find((port) => port.id === edge.target_port_id)?.field;
      if (field) {
        const sender = fieldSender(graph, edge.source_node_id, field);
        return !field.includes('.') && !!sender && widgetElement(sender.kind)?.sends(sender)?.list === true;
      }
      const source = graph.nodes.find((candidate) => candidate.id === edge.source_node_id);
      const ports = source && (registry.node(source.node_type)?.derivedPorts(source, registry)?.outputs ?? source.outputs);
      return ports?.find((port) => port.id === edge.source_port_id)?.multi === true;
    });
    if (listArrives && element.batchMode(node) === 'per_item' && !node.inputs.some((port) => port.multi)) {
      problems.push({
        where,
        problem: 'It is set to run once per item, but none of its inputs is declared as a list -- so it runs once, on everything at once.',
        fix: 'Set "multi": true on the input the list arrives on (and on the output that collects the results), or set batch_mode to "whole_list".',
      });
    }

    problems.push(...definitionProblems(node, where));
    problems.push(...nestedProblems(graph, node, where, depth));
  }

  const edgeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.id)) {
      problems.push({ where: `${inside}edge "${edge.id}"`, problem: 'More than one edge has this id.', fix: 'Give every edge its own id.' });
    }
    edgeIds.add(edge.id);

    const misfit = wireMisfit(graph, edge);
    if (misfit) problems.push({ where: `${inside}edge "${edge.id}"`, ...misfit });
    const missing = exampleMiss(graph, edge);
    if (missing) problems.push({ where: `${inside}node "${edge.target_node_id}", input "${edge.target_port_id}"`, ...missing });

    // A ◆ is a gate and only `true` opens it. A wire that once only said "run
    // after this" -- from a text, a number -- now keeps its node shut for good,
    // and says nothing while doing so.
    if (edge.target_port_id !== RUN_PORT) continue;
    const source = graph.nodes.find((node) => node.id === edge.source_node_id);
    const element = source && registry.node(source.node_type);
    if (!source || !element || element.eventPorts(source).includes(edge.source_port_id)) continue;
    const ports = element.derivedPorts(source, registry)?.outputs ?? source.outputs;
    const port = ports.find((candidate) => candidate.id === edge.source_port_id);
    if (port && port.data_type !== 'boolean' && port.data_type !== 'any') {
      problems.push({
        where: `${inside}edge "${edge.id}"`,
        problem: `It ends on "${edge.target_node_id}"'s ◆, which only the value true opens, and "${source.id}.${port.id}" is declared as ${port.data_type}: the node would never run.`,
        fix: 'Wire a start point\'s "data" into the ◆, or a boolean a code node returns. If this port does carry a boolean, set its data_type to "boolean".',
      });
    }
  }

  // With two nodes sharing an id the ordering cannot be trusted either way, and
  // the duplicate is the thing to fix first.
  if (new Set(graph.nodes.map((node) => node.id)).size === graph.nodes.length) {
    const reads = memoryReads(graph.nodes, graph.edges, registry);
    try {
      topologicalLevels(graph.nodes, graph.edges, registry);
    } catch {
      problems.push({
        where: `${inside}nodes ${names(knot(graph, reads))}`,
        problem: 'These nodes feed each other in a circle, so none of them can run first.',
        fix: 'A loop is only allowed through a node that remembers: a data node closes one. '
          + 'Route the value back through a data node, or remove one of the edges.',
      });
    }
  }

  // What a graph hands back leaves through its end points: a block on the page
  // shows one, a script reads one, and a graph inside a node hands its answer
  // up through them -- in there an end point *is* a port. A page that shows
  // what a memory node holds is something a person sees, with no end point.
  if (!graph.nodes.some((node) => registry.node(node.node_type)?.isResult) && (inside || !showsMemory(graph, registry))) {
    problems.push(inside ? {
      where: `${inside}graph`,
      problem: 'Nothing comes out: a graph inside a node hands its answer up through its end points, and there are none.',
      fix: 'Add an "end" node inside and wire the result into it. Each one is an output port on the node that holds this graph.',
    } : {
      where: 'graph',
      problem: 'Nothing a person can see: there is no end point, so a run computes its answer and shows nobody.',
      fix: 'End every branch in an "end" node -- an end point, what the graph hands back under its name, which a block on the page can show; config.write_mode "file" or "directory" writes it too.',
    });
  }
  if (!inside) problems.push(...sharedResultLabels(graph), ...pageProblems(graph, registry));

  return problems;
}

/**
 * Output nodes whose result is not handed on under their label: they share
 * it, or it is the key another's result already has. Whoever reads the run's
 * result by the label gets one of them and may never know of the other, so
 * it is a problem to fix, said with the keys the run really uses
 * (`resultKeys`). Only at the top: a graph inside a node hands its outputs up
 * by node id, not by label.
 */
function sharedResultLabels(graph: Graph): Problem[] {
  const keys = resultKeys(graph.nodes, registry);
  const byLabel = new Map<string, string[]>();
  for (const node of graph.nodes) {
    if (!keys.has(node.id)) continue;
    const label = registry.node(node.node_type)!.resultLabel(node);
    byLabel.set(label, [...(byLabel.get(label) ?? []), node.id]);
  }
  const problems: Problem[] = [];
  for (const [label, ids] of byLabel) {
    const moved = ids.filter((id) => keys.get(id) !== label);
    if (!moved.length) continue;
    const elsewhere = moved.map((id) => `"${keys.get(id)}"`).join(', ');
    problems.push({
      where: `${ids.length > 1 ? 'nodes' : 'node'} ${names(ids)}`,
      problem: ids.length > 1
        ? `These end points share the label "${label}", so the run's result keeps only the first under it, the rest under ${elsewhere}.`
        : `Its label "${label}" is the key another output's result is handed on under, so the run's result keeps it under ${elsewhere}.`,
      fix: 'Give every end point its own label.',
    });
  }
  return problems;
}

/** The same problem, said about a graph that is inside a node. */
function within(problem: Problem, inside: string): Problem {
  return inside ? { ...problem, where: `${inside}${problem.where}` } : problem;
}

/**
 * The graph a node holds, checked as a graph -- by the function that checked
 * the one above it, with the node in front of what it found.
 *
 * What is wrong with the *node* is the element's to say (`NodeRunner.problems`);
 * what is here is the walking, and how far it may go.
 */
function nestedProblems(graph: Graph, node: GraphNode, where: string, depth: number): Problem[] {
  const element = registry.node(node.node_type);
  if (!element) return [];
  const wired = new Set(graph.edges.filter((edge) => edge.target_node_id === node.id).map((edge) => edge.target_port_id));
  const own = element.problems(node, registry, where, wired);
  const held = element.nestedGraph(node);
  if (!held) return own;

  // Counted, not read off the breadcrumb: a node id may hold anything, this
  // one included.
  if (depth + 1 > NESTING_LIMIT) {
    return [...own, {
      where,
      problem: `Graphs are nested more than ${NESTING_LIMIT} deep here.`,
      fix: 'Flatten one of the levels: past this, nobody can follow what runs where.',
    }];
  }
  return [...own, ...problemsIn(held, `${where} ▸ `, depth + 1)];
}

/**
 * A node's definitions, held to its ports: each must be readable -- its
 * example plain JSON after module.exports -- and name ports the node has: an
 * input.js its inputs, an output.js exactly its outputs, which ✨ Output sets
 * from it. A key that is no port is a value nothing hands on or nothing reads.
 */
function definitionProblems(node: GraphNode, where: string): Problem[] {
  const definitions = registry.node(node.node_type)?.definitions(node);
  if (!definitions) return [];
  const found: Problem[] = [];
  const sides = [
    { file: 'input.js', text: definitions.input, ports: node.inputs, side: 'input', writer: '✨ Input' },
    { file: 'output.js', text: definitions.output, ports: node.outputs.filter((port) => port.id !== ERROR_PORT), side: 'output', writer: '✨ Output' },
  ];
  for (const { file, text, ports, side, writer } of sides) {
    if (!text.trim()) continue;
    const at = `${where}, ${file}`;
    const read = definitionExample(text);
    if ('problem' in read) {
      found.push({ where: at, problem: `It cannot be read: ${read.problem}.`, fix: `Write its example after module.exports as plain JSON, or have ${writer} write it again.` });
      continue;
    }
    const ids = new Set(ports.map((port) => port.id));
    for (const key of Object.keys(read.example).filter((key) => !ids.has(key))) {
      found.push({ where: at, problem: `It names "${key}", which is not one of the node's ${side}s.`, fix: `Its ${side}s are ${names(ids)}: rename the key, or give the node that ${side}.` });
    }
    if (side !== 'output') continue;
    for (const port of ports.filter((one) => !(one.id in read.example))) {
      found.push({ where: at, problem: `It does not name the output "${port.id}", so nothing says what goes out there.`, fix: `Add "${port.id}" to its example, or remove the output: ${writer} sets the outputs from the file.` });
    }
  }
  return found;
}

/**
 * An input that takes a part of what a start point a call starts is sent,
 * which what it is sent for example does not hold: a run of it on its own --
 * and every node written against that example -- is handed nothing there.
 * Only where there is an example: a start point that holds none says nothing
 * of what a call sends, and nothing can disagree with it. The page's own
 * contract, what its blocks send, is `pageProblems`'.
 */
function exampleMiss(graph: Graph, edge: GraphEdge): Omit<Problem, 'where'> | undefined {
  const start = graph.nodes.find((node) => node.id === edge.source_node_id);
  if (!start || registry.node(start.node_type)?.startedBy(start) !== 'call') return undefined;
  const example = start.config.values;
  if (!example || typeof example !== 'object' || Array.isArray(example) || !Object.keys(example).length) return undefined;
  const field = graph.nodes.find((node) => node.id === edge.target_node_id)?.inputs.find((port) => port.id === edge.target_port_id)?.field;
  if (!field || fieldOf(example, field) !== undefined) return undefined;
  return {
    problem: `It takes "${field}" of what "${start.id}" is sent, and what a call sends it for example holds no "${field}": run on its own, it is handed nothing there.`,
    fix: `Add "${field}" to what "${start.id}" is sent for example, or take one of what it holds: ${names(Object.keys(example))}.`,
  };
}

/**
 * A wire whose two ends disagree about what travels on it.
 *
 * Only where both ends have said something: the output definition of the node
 * it starts from -- the shape of its output.js example -- and a declared type
 * on the port it ends on. A wire from a node without one, or into a port that
 * takes anything, has nothing to disagree about.
 */
function wireMisfit(graph: Graph, edge: GraphEdge): Omit<Problem, 'where'> | undefined {
  const producer = graph.nodes.find((node) => node.id === edge.source_node_id);
  const consumer = graph.nodes.find((node) => node.id === edge.target_node_id);
  if (!producer || !consumer) return undefined;
  const given = registry.node(producer.node_type)?.outputInterface(producer)?.properties?.[edge.source_port_id];
  const inputs = registry.node(consumer.node_type)?.derivedPorts(consumer, registry)?.inputs ?? consumer.inputs;
  const port = inputs.find((candidate) => candidate.id === edge.target_port_id);
  if (!given || !port) return undefined;
  const misfit = portMisfit(given, port.data_type, port.multi);
  if (!misfit) return undefined;
  return {
    problem: `It carries "${producer.id}.${edge.source_port_id}" into "${consumer.id}.${port.id}", and the two disagree: ${misfit}.`,
    fix: `Change the data_type of "${consumer.id}.${port.id}", or what "${producer.id}" returns there, in its output.js and its body.`,
  };
}
