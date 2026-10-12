// What a node does when the graph runs.
//
// A runner is the half of a node that executes. It holds the node's
// definition -- what the node is: its ports, its settings, what the executor
// asks of it before and after (`graph/nodes/NodeDefinition.ts`) -- and does what
// the definition cannot, because it needs the services of a `Runtime`. A tool
// carries runners and definitions; it carries no design (`graph/editor/nodes/`).

import type { GraphNode } from '../../../../graph/graph.ts';
import type { NodeDefinition } from '../../../../graph/nodes/NodeDefinition.ts';
import type { Runtime } from '../../../../graph/nodes/Runtime.ts';

export abstract class NodeRunner<K extends NodeDefinition = NodeDefinition> {
  readonly kind: K;

  constructor(kind: K) {
    this.kind = kind;
  }

  /** Run once, for inputs already collected from the wires. */
  abstract execute(
    node: GraphNode,
    inputs: Record<string, unknown>,
    runtime: Runtime,
  ): Promise<Record<string, unknown>>;
}

/** What runs a node, by type: the executor asks it, as it asks `Kinds` what a node is. */
export interface Runners {
  node(type: string): NodeRunner | undefined;
}
