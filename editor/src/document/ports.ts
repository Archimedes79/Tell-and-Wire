// The ports a node has, where they follow from its settings.
import type { GraphNode, Port } from '@/graph';
import { registry as engineRegistry } from '@engine/elements/registry.ts';
import { keepingFields } from '@engine/elements/port.ts';

/**
 * The ports a node has, when they follow from its settings rather than being
 * named by hand -- the engine's answer (`NodeRunner.derivedPorts`), the same
 * one a load and a run get, so the canvas never draws a port the engine will
 * not produce.
 *
 * Null for a code, AI or data node, or an end point: a person names those to
 * match the code they wrote or the prompt they gave, so the graph is the
 * authority and an element declaring `input` and `value` for them would
 * invent a contract nobody agreed to. A start point, a folder node and a node
 * that holds a graph are the other kind -- each input keeping the part of a
 * start point's package a person chose for it (`keepingFields`).
 */
export function derivedNodePorts(node: GraphNode): { inputs: Port[]; outputs: Port[] } | null {
  const derived = engineRegistry.node(node.node_type)?.derivedPorts(node as never, engineRegistry as never);
  return derived ? keepingFields(derived, node.inputs as never) as { inputs: Port[]; outputs: Port[] } : null;
}
