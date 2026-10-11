import { NodeRunner } from '../NodeRunner.ts';
import { runBody } from '../body.ts';
import type { Runtime } from '../../../../../graph/nodes/Runtime.ts';
import type { GraphNode } from '../../../../../graph/graph.ts';
import type { CodeNodeDefinition } from '../../../../../graph/nodes/code/CodeNodeDefinition.ts';

/** Runs a code node's body, sandboxed: `run(inputs, node)` in code.js. */
export class CodeNodeRunner extends NodeRunner<CodeNodeDefinition> {
  async execute(
    node: GraphNode,
    inputs: Record<string, unknown>,
    runtime: Runtime,
  ): Promise<Record<string, unknown>> {
    const logic = this.kind.logic(node);
    if (logic.isEmpty) {
      throw new Error(`${node.label || node.id}: its code.js holds no code yet -- write it with ✨ Code.`);
    }

    // Once, for whatever it was handed. Fanning out and reading wired files
    // into their content are the executor's business (see `batchMode` and
    // `readsFileInputs`), so this stays one call.
    //
    // It may ask a model: `await node.llm({ prompt })`, answered by the
    // process that holds the keys, on the one AI setting's model.
    return runBody(logic.body, inputs, runtime);
  }
}
