import { NodeRunner } from '../NodeRunner.ts';
import type { GraphNode } from '../../../../../graph/graph.ts';
import { hasField, namesOf, type DataNodeDefinition } from '../../../../../graph/nodes/data/DataNodeDefinition.ts';

/** The struct of a data node: it fills from what arrives and hands on what it then holds. */
export class DataNodeRunner extends NodeRunner<DataNodeDefinition> {
  /** Fill, then forward: what arrived on a field replaces it, and the struct as it is then goes on. It is kept when the round is over (`settleMemory`). */
  async execute(node: GraphNode, inputs: Record<string, unknown>) {
    const { fields: held } = this.kind.config(node);
    const now = { ...held };
    for (const name of namesOf(node)) if (hasField(inputs, name) && inputs[name] !== undefined) now[name] = inputs[name];
    return now;
  }
}
