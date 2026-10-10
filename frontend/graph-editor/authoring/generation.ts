// ✨ for one node: what its chats ask the backend, and what comes back, written in.
//
// A node's ✨ writes one of its files -- its input definition (input.js), its
// output definition (output.js), or its body: code.js, prompt.md, or what a
// data node holds -- through one route (`generate`), from one request built
// here: the node as the view holds it, the graph around it in words
// ({Context}, `graphContext.ts`), what feeds each input and what each output
// feeds, and the files the Input and Output chats are given. A node's view,
// the toolbar's sweep and "what is sent" all build it here, so none of them
// can tell the model less than the others. What comes back is written into the
// node by one pure function (`writtenInto`), and the exchange into its
// history.md.

import type { Graph, GraphNode, GuiWidget, Port, Wire } from '../../app/graph';
import { call, type AICall, type GenerateRequest, type GenerateResponse, type ProbeReport } from '../../app/api/client';
import type { Refine } from '../../../backend/app/api.ts';
import { definitionExample, definitionKeys } from '../../../graph/authoring/definition.ts';
import { exchangeEntry, exchangeLabel, withExchange } from '../../../graph/authoring/history.ts';
import { registry as runnerRegistry } from '../../../graph/nodes/registry.ts';
import { ERROR_PORT } from '../../../graph/execution/wiring.ts';
import { inputSources, outputTargets } from './generationContext';
import { graphContext } from './graphContext';
import { runsPerItem } from './perItem';
import { filesOf } from '../../app/document/givenFiles';
import { derivedNodePorts } from '../../app/document/ports';

/** What one ✨ writes: a node's input definition, its output definition, or its body. */
export type Write = 'input' | 'output' | 'body';

/** A file a node keeps and its view shows: what a ✨ writes, and the example a data node's Fields ✨ writes along with its body. */
export type Part = Write | 'example';

export type { Refine };

/** Where a node keeps its body -- and a second file written with it, where it has one -- and what the body is: the runner's own answer (`NodeRunner.generation`). */
export function bodyOf(node: GraphNode): { field: string; example?: string; kind: 'code' | 'prompt' | 'data' } | undefined {
  const generation = runnerRegistry.node(node.node_type)?.generation();
  return generation && { field: generation.fields.body, ...(generation.fields.example ? { example: generation.fields.example } : {}), kind: generation.kind };
}

/** Whether a ✨ of *node*'s writes definitions as well as a body: a code or an ai node's. */
export function hasDefinitions(node: GraphNode): boolean {
  return runnerRegistry.node(node.node_type)?.definitions(node as never) !== undefined;
}

/** *node*'s definitions as its runner reads them: '' for one it has none of. */
function definitionsOf(node: GraphNode): { input: string; output: string } {
  return runnerRegistry.node(node.node_type)?.definitions(node as never) ?? { input: '', output: '' };
}

/**
 * Where a node keeps what *write* writes: the setting, and the file it is kept
 * in with that file's stub -- asked of the node's runner, which says which of
 * a node's settings are files (`NodeRunner.texts`).
 */
export function fileOf(node: GraphNode, part: Part): { field: string; file: string; stub: string; json: boolean } {
  const field = part === 'input' ? 'input_definition' : part === 'output' ? 'output_definition'
    : part === 'example' ? bodyOf(node)?.example ?? 'data_example' : bodyOf(node)?.field ?? 'code';
  const text = runnerRegistry.node(node.node_type)?.texts(node as never).find((candidate) => candidate.field === field);
  return { field, file: text?.file ?? field, stub: text?.standard ?? '', json: text?.json === true };
}

/**
 * What *part*'s ✨ writes into, as the node holds it: the definition, or the
 * body as text -- or a data node's example. A struct with no fields -- what a
 * data node starts as -- holds nothing.
 */
export function heldBy(node: GraphNode, part: Part): string {
  if (part === 'input' || part === 'output') return definitionsOf(node)[part];
  const body = bodyOf(node);
  const field = part === 'example' ? body?.example : body?.field;
  const value = field ? (node.config as Record<string, unknown>)[field] : undefined;
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  const empty = typeof value === 'object' && !Array.isArray(value) && !Object.keys(value).length;
  return empty ? '' : JSON.stringify(value, null, 2);
}

/**
 * Whether the node holds what *write*'s ✨ writes: something, where its file
 * would otherwise be the stub. A sweep writes what is not, and leaves alone
 * what somebody wrote.
 */
export function isWritten(node: GraphNode, part: Part): boolean {
  return !!heldBy(node, part).trim();
}

/** What a press asks for: one of a node's files, or -- Auto generate -- all of them. */
export type Press = Write | 'all';

/**
 * The files a node's view shows, in the order they are worked on: its input
 * definition where something comes in, its output definition, its body -- or
 * the body and its example, for a data node. None for a node nothing is
 * written for.
 */
export function partsOf(node: GraphNode): Part[] {
  const body = bodyOf(node);
  if (!body) return [];
  if (!hasDefinitions(node)) return body.example ? ['body', 'example'] : ['body'];
  return [...(node.inputs.length ? ['input' as const] : []), 'output', 'body'];
}

/**
 * What one press writes, in order. For the body of a node that has
 * definitions, what is missing first -- its input definition where it takes
 * something in and has none, its output definition where it has none -- so
 * one press does the whole node. Auto generate does that the first time; once
 * the body is written it writes each again, as the Input, Output and body
 * chats would one after another. A data node has its body only: its Fields
 * ✨ writes the example with it.
 */
export function writesFor(node: GraphNode, write: Press): Write[] {
  if (write === 'all') {
    if (!hasDefinitions(node)) return ['body'];
    return isWritten(node, 'body') ? partsOf(node).filter((part): part is Write => part !== 'example') : writesFor(node, 'body');
  }
  if (write !== 'body' || !hasDefinitions(node)) return [write];
  return [
    ...(node.inputs.length && !isWritten(node, 'input') ? ['input' as const] : []),
    ...(!isWritten(node, 'output') ? ['output' as const] : []),
    'body',
  ];
}

/**
 * Why a definition ✨ wrote does not fit the node -- its example names no
 * input it has, or leaves out an output wired on -- or undefined. It is
 * written all the same, to be seen and changed; what a press would write
 * after it waits, since it would be written against it.
 */
export function unfitDefinition(write: Write, probe: ProbeReport | undefined): string | undefined {
  if (write === 'body' || probe?.status !== 'failed') return undefined;
  return lowerFirst([probe.error, ...probe.problems].filter(Boolean).join(' ')) || 'it does not fit the node.';
}

const lowerFirst = (text: string): string => text.charAt(0).toLowerCase() + text.slice(1);

/** The ids of *node*'s ports on one side, as the files name them: the executor's error port is no part of what a node says. */
export function portIdsOf(node: GraphNode, side: 'input' | 'output'): string[] {
  return (side === 'input' ? node.inputs : node.outputs).map((port) => port.id).filter((id) => id !== ERROR_PORT);
}

/** Whether the definition of *side* names ports other than the node has: it is written, and says one thing where the node is another. */
export function strayDefinition(node: GraphNode, side: 'input' | 'output'): boolean {
  const named = definitionKeys(heldBy(node, side));
  const ports = portIdsOf(node, side);
  return named.length > 0 && (named.length !== ports.length || named.some((id) => !ports.includes(id)));
}

/** What a file is called on its row, in its chat and in history.md: its part. */
export function partName(node: GraphNode, part: Part): string {
  if (part === 'input') return 'Input';
  if (part === 'output') return 'Output';
  if (part === 'example') return 'Example';
  const kind = bodyOf(node)?.kind;
  return kind === 'prompt' ? 'Prompt' : kind === 'data' ? 'Fields' : 'Code';
}

/** What a ✨ is called in a message. */
export function writeName(node: GraphNode, write: Write): string {
  return `✨ ${partName(node, write)}`;
}

/**
 * What an exchange is called in history.md (`exchangeLabel`): its part, and the
 * words said to the chat -- the change asked for, or the first words -- or that
 * it was a fix; *failed* marks one that brought nothing back.
 */
export function exchangeName(node: GraphNode, write: Write, how: { refine?: Refine; ask?: string; failed?: boolean } = {}): string {
  const { refine, ask, failed } = how;
  return exchangeLabel(partName(node, write), refine ? refine.change : ask, { fix: !!refine && !refine.change?.trim(), failed });
}

/** Why ✨ cannot write for *node* yet, or undefined: it is written from the node's text, or from what the chat was told. */
export function generationGuard(node: GraphNode, say: { refine?: Refine; ask?: string } = {}): string | undefined {
  if (node.description.trim() || say.ask?.trim() || say.refine?.change?.trim()) return undefined;
  return 'Say what this node should do first: its text is what ✨ writes from.';
}

/** The graph a node sits in, as ✨ is told it. */
interface Around {
  nodes: GraphNode[];
  edges: Wire[];
  metadata: Graph['metadata'];
  /** The page's blocks: what its start points are sent, what shows its end points. */
  page: GuiWidget[];
}

/**
 * The request *write*'s ✨ sends for *node*, exactly -- built in one place,
 * so "what is sent" and the real chat cannot describe two different
 * requests. Its history is not sent: nothing is written from it. *say* is
 * what the person said to the chat: the words for a file not written yet
 * (`ask`), or the change to the file there is (`refine`).
 */
export function generateRequest(
  node: GraphNode, write: Write, around: Around, inputFiles: string[] = [], say: { refine?: Refine; ask?: string } = {},
): GenerateRequest {
  const { refine, ask } = say;
  const config = { ...node.config } as Record<string, unknown>;
  delete config.history;
  return {
    node: { ...node, config } as GenerateRequest['node'],
    write,
    context: graphContext(node.id, around),
    ...(write === 'input' && inputFiles.length ? { input_files: inputFiles.map((path) => ({ path })) } : {}),
    ...(write === 'output' && filesOf(node, 'output').length ? { output_files: filesOf(node, 'output').map((path) => ({ path })) } : {}),
    input_sources: inputSources(node.id, around.nodes, around.edges, true, around.page),
    output_targets: outputTargets(node.id, around.nodes, around.edges, true, around.page),
    ...(ask?.trim() ? { ask: ask.trim() } : {}),
    ...(refine ? { refine } : {}),
  };
}

/** What ✨ would send, without sending it: the backend builds the same request and stops at the model. */
export async function previewGeneration(request: GenerateRequest): Promise<AICall[]> {
  const response = await call('generate', { ...request, preview: true });
  return response.calls ?? [];
}

/** A value's port type, as an output definition's example shows it. */
function typeOf(value: unknown): Port['data_type'] {
  if (typeof value === 'string') return 'text';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value)) return 'list';
  return value && typeof value === 'object' ? 'json' : 'any';
}

/**
 * *node*'s outputs as an output definition names them: its example's keys are
 * the outputs. A port already there keeps what it is; a new one is typed by
 * its example, and hands on a list where the node runs once per item. The
 * executor's error port stays while the node catches its failures.
 */
export function outputsFrom(node: GraphNode, definition: string): Port[] {
  const read = definitionExample(definition);
  if (!('example' in read)) return node.outputs;
  const perItem = runsPerItem(node);
  const ports: Port[] = Object.entries(read.example).map(([id, value]) => node.outputs.find((port) => port.id === id) ?? {
    id, name: id, kind: 'output', data_type: typeOf(value), multi: perItem, required: false, description: '',
  });
  const error = node.outputs.find((port) => port.id === ERROR_PORT);
  return error ? [...ports, error] : ports;
}

/**
 * *node* with the outputs its output definition names, once it was edited by
 * hand -- as ✨ Output sets them. The same node while the definition cannot be
 * read or names the outputs it has.
 */
export function outputsAsDefined(node: GraphNode): GraphNode {
  const definition = String(node.config.output_definition ?? '');
  if (!definitionKeys(definition).length) return node;
  const outputs = outputsFrom(node, definition);
  const ids = (ports: Port[]) => ports.map((port) => port.id).join('\n');
  return ids(outputs) === ids(node.outputs) ? node : { ...node, outputs };
}

/**
 * *node* with what *write*'s ✨ brought back written in, as one step: the file
 * it wrote -- an output definition setting the outputs too, and so the one a
 * changed or fixed body came back with (`output_definition`), which the body
 * was held to -- the text restated where a change was asked, and the exchange
 * at the end of its history.
 */
export function writtenInto(
  node: GraphNode, write: Write, response: Pick<GenerateResponse, 'result' | 'description' | 'output_definition' | 'example' | 'calls'>, name: string, at = new Date(),
): GraphNode {
  const config = { ...node.config } as Record<string, unknown>;
  let outputs = node.outputs;
  const definesOutputs = (definition: string) => {
    config.output_definition = definition;
    if (definitionKeys(definition).length) outputs = outputsFrom(node, definition);
  };
  if (write === 'input') config.input_definition = response.result;
  else if (write === 'output') definesOutputs(response.result);
  else {
    const body = bodyOf(node);
    if (body?.kind === 'data') {
      config[body.field] = fieldsFrom(response.result);
      // Written with them, or gone: an example of fields that are not these would be written against.
      if (body.example) config[body.example] = response.example ? fieldsFrom(response.example) : undefined;
    } else if (body) config[body.field] = response.result;
    if (response.output_definition?.trim()) definesOutputs(response.output_definition);
  }
  config.history = withHistory(node, name, response.calls, at);
  const written: GraphNode = {
    ...node,
    ...(response.description?.trim() ? { description: response.description.trim() } : {}),
    outputs,
    config: config as GraphNode['config'],
  };
  // Where the ports follow from what was written -- a data node's fields -- they follow it now.
  return { ...written, ...(derivedNodePorts(written) ?? {}) };
}

/**
 * The fields ✨ wrote, from its answer: the object it is -- or, for any other
 * JSON, a struct of the one field "value" (the backend refused what does not parse).
 */
export function fieldsFrom(text: string): unknown {
  const parsed: unknown = JSON.parse(text);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { value: parsed };
}

/** *node*'s history.md with one more exchange at its end: *calls*, under *name*. */
export function withHistory(node: GraphNode, name: string, calls: AICall[], at = new Date()): string {
  return withExchange(String(node.config.history ?? ''), exchangeEntry(name, calls, at));
}

/**
 * What to say once *write*'s ✨ is done: that it was written -- or changed, as
 * *refine* asked -- and, where the backend tried it, on what and how that went,
 * so a body that does not fit its output.js is said now rather than by the
 * next run. ✨ Fix (a *refine* with no change) says what the repair came to.
 */
export function resultMessage(name: string, response: Pick<GenerateResponse, 'probe' | 'output_definition'>, refine?: Refine): string {
  const { probe } = response;
  const withOutput = !!response.output_definition?.trim();
  if (refine && !refine.change?.trim()) return fixMessage(probe, withOutput);
  const done = `${name}: ${refine ? 'changed' : 'written'}${withOutput ? ', with a new output.js' : ''}`;
  switch (probe?.status) {
    case 'ok':
      return `✅ ${done}, and it fits output.js on the example in input.js.`;
    case 'repaired':
      return `✅ ${done}. The first attempt did not fit output.js on the example; this one does.`;
    case 'failed':
      if (probe.error) return `⚠️ ${done}, but it fails on the example in input.js: ${probe.error}`;
      return `⚠️ ${done}, but ${lowerFirst(probe.problems.join('; '))}`;
    default:
      return `✅ ${done}.`;
  }
}

/**
 * ✨ Fix is a repair: what it came to -- repaired, or still not -- not that a
 * body was written. *mended*: output.js came back corrected with it.
 */
function fixMessage(probe: ProbeReport | undefined, mended: boolean): string {
  switch (probe?.status) {
    case 'ok':
    case 'repaired':
      return `✅ ✨ Fix: repaired${mended ? ', output.js corrected' : ''}, and it fits output.js on the example in input.js.`;
    case 'failed':
      if (probe.error) return `⚠️ ✨ Fix: it still fails on the example in input.js: ${probe.error}`;
      return `⚠️ ✨ Fix: still does not fit -- ${lowerFirst(probe.problems.join('; '))}`;
    default:
      // Nothing to try it on here -- an AI node's prompt.md is tried by ▶ Try.
      return '✅ ✨ Fix: written again. ▶ Try tries it.';
  }
}
