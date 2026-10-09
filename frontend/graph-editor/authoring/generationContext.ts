import type { ExecutionResult, GraphNode, GuiWidget, Wire } from '../../app/graph';
// This module reads the element registry, so no element's `…GuiBuilder.ts` may import
// it: that would be a cycle through the registry (see `document/givenFiles.ts`).
import { NODE_BUILDERS, WIDGET_BUILDERS } from '../../app/elements/registry';
import { registry as runnerRegistry } from '../../../graph/nodes/registry.ts';
import { fieldOf } from '../../../graph/execution/executor.ts';
import { blockCan, blockReceives, blocksAt } from '../../app/document/page';
import { blockSize } from '../../app/document/layout';
import { cut } from '../../app/ui/cut';

/**
 * What ✨ tells the model about the world around a node.
 *
 * A node's text says what the person wants; these say what the node is wired
 * to and what really flowed through it. Without them a model has to guess what
 * arrives, and a small local model guesses badly.
 *
 * They are facts, not sentences: which node feeds each input and what it hands
 * on (`inputSources`), where each output goes and what the node there wants
 * (`outputTargets`), what arrived on the last run (`lastRunInputs`). The
 * backend's brief (`backend/graph-editor/brief.ts`) is the one place they are
 * put into words: {Input Definition} and {Output Definition} while a node has
 * none of its own.
 *
 * Where a wire comes from a start point or ends at an end point, the page is
 * part of the fact: what its blocks send a start point -- the one value an
 * input takes of it, by its field -- and what the block that shows an end
 * point wants, at the size it is drawn.
 */

/** A block, as a person calls it -- "a chart block "Plot"" -- not the file format's "plot_window". */
export function calledBlock(widget: GuiWidget): string {
  const called = WIDGET_BUILDERS[widget.kind]?.called(widget) ?? widget.kind;
  return `${/^[aeiou]/i.test(called) ? 'an' : 'a'} ${called} block${widget.label ? ` "${widget.label}"` : ''}`;
}

/** What a call sends start point *start* for example, at *field* -- all of it, without one -- as JSON cut short; nothing, without an example. */
function exampleAt(start: GraphNode, field?: string): string | undefined {
  const example = start.config.values;
  if (!example || typeof example !== 'object' || !Object.keys(example).length) return undefined;
  const value = field ? fieldOf(example, field) : example;
  if (value === undefined) return undefined;
  return cut(JSON.stringify(value), 200);
}

/**
 * What the page sends start point *start*, in words, for an input that takes
 * *field* of its package -- or the whole package, without one: each block
 * that sends to it, by its id, with what it sends -- or what a call sends
 * it, for example.
 */
function sentWords(start: GraphNode, page: GuiWidget[], field: string | undefined): string {
  const senders = blocksAt(page, start.id).send;
  if (field) {
    const [id, ...inside] = field.split('.');
    const block = senders.find((widget) => widget.id === id);
    const example = exampleAt(start, field);
    if (!block && example) return `"${field}" of what a call sends it -- for example ${example}`;
    if (!block) return `"${field}" of what it is sent, which no block of the page sends it`;
    const sent = blockCan(block).sends;
    if (!inside.length) return `what ${calledBlock(block)} sends -- ${sent?.description ?? 'its value'}`;
    // The part alone, in its own words: said with the whole object after it,
    // ✨ wrote code reading `.content` of the text the input is handed.
    const part = sent?.keys?.[inside.join('.')];
    return `only "${inside.join('.')}" of what ${calledBlock(block)} sends${part ? `: ${part.description}` : ''}`;
  }
  const values = senders.map((widget) => `"${widget.id}": what ${calledBlock(widget)} sends -- ${blockCan(widget).sends?.description ?? 'its value'}`);
  const example = senders.length ? undefined : exampleAt(start);
  if (example) return `one package {"event", "values"}, its values what a call sends -- for example ${example}`;
  return `one package {"event", "values"}${values.length ? `, its values ${values.join('; ')}` : ''}`;
}

/** What the blocks that show end point *end* want, in words: each block, what it draws, at the size it is drawn. */
function shownWords(end: GraphNode, page: GuiWidget[]): string[] {
  return blocksAt(page, end.id).show.map((widget) => {
    const { w, h, width, height } = blockSize(widget);
    const size = `shown at about ${width} x ${height} px (${w} x ${h} cells)`;
    const text = WIDGET_BUILDERS[widget.kind]?.textShown();
    const wants = blockReceives(widget)?.trim().replace(/\.$/, '');
    return `shown by ${calledBlock(widget)}${wants ? `, which wants ${wants}` : ''}; ${[size, text].filter(Boolean).join(', ')}`;
  });
}

/**
 * The raw values this node's input ports received on the last run -- a path,
 * where one was read -- or undefined when it has not run: where the file ✨
 * Input writes from may come from (`exampleFile.ts`).
 */
export function lastRunInputs(
  nodeId: string,
  result: ExecutionResult | null,
): Record<string, unknown> | undefined {
  const inputs = result?.node_results?.find((r) => r.node_id === nodeId)?.inputs;
  if (!inputs || Object.keys(inputs).length === 0) return undefined;
  return inputs;
}

/**
 * Which node, and which of its ports, feeds each of *nodeId*'s input ports.
 *
 * The wiring is the one thing a generation request cannot otherwise carry, and
 * it is what turns a skeleton line from `files: list[str]` into
 * `files: list[str]  // from "Folder" (port "Files")` — provenance, which no
 * type expresses. What the input takes matters as much as the node: the blocks
 * of a page all send into one package of a start point, and an input takes one
 * field of it -- a file picked, a text typed -- so code written against the
 * wrong one reads a file name as the text.
 *
 * A port fed by several nodes (fan-in) names them all: that a value is a list
 * *because two nodes write into it* is exactly the case generated code gets
 * wrong when it assumes a scalar.
 *
 * *withEmits*, for ✨: each source followed by what that node says it hands
 * on, so the model is told the wire and the declaration behind it in one line
 * -- for a start point, what *page* sends it, as the input takes it.
 */
export function inputSources(
  nodeId: string,
  nodes: GraphNode[],
  edges: Wire[],
  withEmits = false,
  page: GuiWidget[] = [],
): Record<string, string> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const byPort: Record<string, string[]> = {};
  for (const edge of edges) {
    if (edge.target !== nodeId) continue;
    const source = byId.get(edge.source);
    if (!source) continue;
    const port = source.outputs.find((p) => p.id === edge.sourceHandle);
    const field = byId.get(nodeId)?.inputs.find((p) => p.id === edge.targetHandle)?.field;
    let said = port ? `"${source.label}" (port "${port.name}")` : `"${source.label}"`;
    if (field) said += `, as "${field}"`;
    // The port's own words first, then what the node declares of its output
    // (`NodeGuiBuilder.describeOutput`) -- for a start point, what the page or
    // a call sends it, which says it all.
    const sent = runnerRegistry.node(source.node_type)?.takesPackage && (page.length || exampleAt(source)) ? sentWords(source, page, field) : '';
    const emits = !withEmits ? ''
      : sent || [...new Set([port?.description?.trim(), NODE_BUILDERS[source.node_type]?.describeOutput(source, edge.sourceHandle ?? undefined)].filter(Boolean))].join('; ');
    if (emits) said += `, which hands on: ${emits}`;
    (byPort[edge.targetHandle ?? 'input'] ??= []).push(said);
  }
  return Object.fromEntries(
    Object.entries(byPort).map(([port, origins]) => [port, [...new Set(origins)].join(' + ')]),
  );
}

/**
 * Where each of *nodeId*'s output ports goes, by port id: `"Chart" (port
 * "Points")`. The other half of `inputSources`, for the panel: a port says
 * what it is connected to, so "how does this reach that" is answered where the
 * port is named rather than by squinting at the canvas -- and an end point,
 * which block of *page* shows it.
 */
export function outputTargets(
  nodeId: string,
  nodes: GraphNode[],
  edges: Wire[],
  withWants = false,
  page: GuiWidget[] = [],
): Record<string, string> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const byPort: Record<string, string[]> = {};
  for (const edge of edges) {
    if (edge.source !== nodeId) continue;
    const target = byId.get(edge.target);
    if (!target) continue;
    const port = target.inputs.find((p) => p.id === edge.targetHandle)?.name;
    let said = port ? `"${target.label}" (port "${port}")` : `"${target.label}"`;
    // For ✨: what the node there wants, said by that node -- and, at an end
    // point, by the block that shows it (a chart: a figure).
    const wants = withWants && edge.targetHandle ? NODE_BUILDERS[target.node_type]?.wantsOn(target, edge.targetHandle) : undefined;
    if (wants) said += `, which wants ${wants}`;
    const shown = runnerRegistry.node(target.node_type)?.isResult && edge.targetHandle !== 'path' ? shownWords(target, page) : [];
    if (shown.length) said += `; ${shown.join('; ')}`;
    (byPort[edge.sourceHandle ?? 'output'] ??= []).push(said);
  }
  return Object.fromEntries(
    Object.entries(byPort).map(([port, targets]) => [port, [...new Set(targets)].join(' + ')]),
  );
}
