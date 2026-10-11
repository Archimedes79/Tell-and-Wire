import { NodeRunner } from '../NodeRunner.ts';
import type { Runtime } from '../../../../../graph/nodes/Runtime.ts';
import type { GraphNode } from '../../../../../graph/graph.ts';
import { ALL_FIELDS, BEFORE, ROUND, hasField, namesOf, type DataNodeDefinition } from '../../../../../graph/nodes/data/DataNodeDefinition.ts';

/** The struct of a data node: it fills from what arrives and hands on what it then holds. */
export class DataNodeRunner extends NodeRunner<DataNodeDefinition> {
  /** Fill, then forward: what arrived on a field replaces it, and the struct as it is then goes on, with the round count. It is kept when the round is over (`settleMemory`). */
  async execute(node: GraphNode, inputs: Record<string, unknown>, _runtime: Runtime) {
    const { fields: held, round: was } = this.kind.config(node);
    const now = { ...held };
    for (const name of namesOf(node)) if (hasField(inputs, name) && inputs[name] !== undefined) now[name] = inputs[name];
    const round = was + 1;
    return { ...now, [ROUND]: round, [ALL_FIELDS]: { ...now, [ROUND]: round }, [BEFORE]: { ...held, [ROUND]: round } };
  }
}
