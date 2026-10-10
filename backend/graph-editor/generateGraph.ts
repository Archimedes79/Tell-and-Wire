// Writing a whole graph with a model: one designed from a description, or the
// graph there is, changed as asked.
//
// The reply is read as every ✨ reply is (`generate.ts`) and its transcript kept
// the same way. What the model was not shown or left out is put back from the
// graph it was sent (`keptFrom`).

import type { AiService } from '../../graph/nodes/Runtime.ts';
import { parseGraph, type Graph, type GraphNode } from '../../graph/graph.ts';
import { registry } from '../../graph/nodes/registry.ts';
import { AUTHORING_KEYS } from '../../graph/authoring/handedOn.ts';
import { exchangeEntry, withExchange } from '../../graph/authoring/history.ts';
import { GRAPH_SYSTEM } from './graphPrompt.ts';
import { changePrompt } from './generatePrompts.ts';
import { GenerationFailed, firstBlock, recording } from './generate.ts';
import type { AICall, Target } from '../app/api.ts';

/** A value as JSON with every object's keys in one order: two that say the same compare equal. */
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => (
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : item));

/** What a node says and holds, as a change could touch it: not where it stands, and not what only writing it needs. */
function said(node: unknown): string {
  try {
    const [parsed] = parseGraph({ nodes: [node], edges: [] }).nodes;
    const config = { ...parsed.config } as Record<string, unknown>;
    for (const key of AUTHORING_KEYS) delete config[key];
    return canonical([parsed.node_type, parsed.label, parsed.description, parsed.inputs, parsed.outputs, config]);
  } catch {
    // Not a node the route could read either: said once, where the document is parsed.
    return '';
  }
}

/**
 * *answer* with what it left out of *current* put back: the graph's name and
 * scheme, where each node it kept stands and the size it was drawn at, and
 * the page, when the answer says nothing of it. Left out, each fell to its
 * default -- a change to one node renamed the tool and moved every node into
 * the corner.
 *
 * And what only writing a node needs (`AUTHORING_KEYS`, its history above all)
 * is the project's, never the answer's: the model was not shown it, so each
 * node kept has its own back -- in the graphs nodes hold too -- and what the
 * answer says there is dropped. A node the change touched -- new, or different
 * in what it says or holds -- gets *entry* at the end of its history, as after
 * every ✨.
 */
function keptFrom(current: Graph, answer: unknown, entry: string): unknown {
  if (!answer || typeof answer !== 'object') return answer;
  const document = answer as { metadata?: object; nodes?: unknown; page?: unknown };
  const before = new Map(current.nodes.map((node) => [node.id, node]));
  const nodes = Array.isArray(document.nodes)
    ? document.nodes.map((node: unknown) => keptNode(node && typeof node === 'object' ? before.get(String((node as { id?: unknown }).id)) : undefined, node, entry))
    : document.nodes;
  return {
    ...document, metadata: { ...current.metadata, ...(document.metadata ?? {}) }, nodes,
    ...(document.page === undefined && current.page ? { page: current.page } : {}),
  };
}

/** One node of an answer, as `keptFrom` hands it on: *was* is the node of that id in the graph that was sent. */
function keptNode(was: GraphNode | undefined, given: unknown, entry: string): unknown {
  if (!given || typeof given !== 'object') return given;
  const node = { ...given } as Record<string, unknown> & GraphNode;
  const config = { ...(node.config && typeof node.config === 'object' ? node.config : {}) } as Record<string, unknown>;
  for (const key of AUTHORING_KEYS) delete config[key];
  if (was) {
    for (const key of ['position', 'width', 'height'] as const) if (node[key] === undefined) (node as Record<string, unknown>)[key] = was[key];
    for (const key of AUTHORING_KEYS) if (was.config[key] !== undefined) config[key] = was.config[key];
  }
  node.config = config as GraphNode['config'];
  const element = registry.node(String(node.node_type));
  const inside = element?.nestedGraph(node);
  if (element && inside) {
    const before = (was && registry.node(was.node_type)?.nestedGraph(was)) || parseGraph({ nodes: [], edges: [] });
    element.setNestedGraph(node, parseGraph(keptFrom(before, inside, entry)));
  }
  const keepsHistory = !!element?.texts(node).some((text) => text.field === 'history');
  if (keepsHistory && (!was || said(was) !== said(node))) config.history = withExchange(String(config.history ?? ''), entry);
  return node;
}

/**
 * Ask for a whole Graph DSL document: one designed from *description* -- or,
 * given the graph there is (*current*), that graph changed as *description*
 * says, its ids and whatever the change does not touch kept. A graph with no
 * nodes yet is designed, under its name. The caller parses the document.
 */
export async function generateGraph(
  description: string, deps: { ai: AiService; target: Target; calls?: AICall[] }, current?: Graph,
): Promise<{ graph: unknown; explanation: string; calls: AICall[] }> {
  const calls: AICall[] = deps.calls ?? [];
  const ai = recording(deps.ai, calls);
  const prompt = current?.nodes.length
    ? changePrompt(current, description)
    : `Design a graph that does the following:\n${description}`;
  let raw: string;
  try {
    raw = await ai.complete({ prompt, system: GRAPH_SYSTEM, ...deps.target });
  } catch (error) {
    throw new GenerationFailed(error instanceof Error ? error.message : String(error), calls);
  }
  // Read as every other answer is: a code node's body in the document may
  // write "```" into a string, and the block does not end there.
  const fenced = firstBlock(raw);
  const candidate = fenced ? fenced.code : raw.trim();
  let graph: unknown;
  try {
    graph = JSON.parse(candidate);
  } catch {
    // Said to whoever asked at the bar: what went wrong most often, and what to do. The transcript keeps the rest.
    throw new GenerationFailed('The model\'s answer was not a whole graph -- it may have been cut off. Try again, or ask for less at once.', calls);
  }
  return {
    graph: current ? keptFrom(current, graph, exchangeEntry(`Change of the graph: ${description}`, calls, new Date())) : graph,
    explanation: fenced?.after ?? '',
    calls,
  };
}
