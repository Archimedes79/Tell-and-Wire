// The ports a node has, where they follow from its settings.
import type { GraphNode, Port } from '../graph';
import { registry as runnerRegistry } from '../../../graph/nodes/registry.ts';
import { keepingFields } from '../../../graph/nodes/port.ts';

/**
 * The ports a node has, when they follow from its settings rather than being
 * named by hand -- the runner's answer (`NodeRunner.derivedPorts`), the same
 * one a load and a run get, so the canvas never draws a port a run will
 * not produce.
 *
 * Null for a code, AI or end node: a person names those to match the code
 * they wrote or the prompt they gave, so the graph is the authority and an
 * element declaring `input` and `value` for them would invent a contract
 * nobody agreed to. A start point, a folder node, a node that holds a graph
 * and a data node -- its fields -- are the other kind: each input keeping the
 * part of a start point's package a person chose for it (`keepingFields`).
 */
export function derivedNodePorts(node: GraphNode): { inputs: Port[]; outputs: Port[] } | null {
  const derived = runnerRegistry.node(node.node_type)?.derivedPorts(node as never, runnerRegistry as never);
  return derived ? keepingFields(derived, node.inputs as never) as { inputs: Port[]; outputs: Port[] } : null;
}
