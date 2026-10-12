import { NodeDesign, type DeployNeeds, type WhatRuns } from '../NodeDesign.ts';
import type { LogicFields } from '../../../files/logic.ts';
import type { Generation } from '../../generation.ts';
import type { AiNodeDefinition } from '../../../nodes/ai/AiNodeDefinition.ts';

/** Where an ai node keeps its body: the instructions it runs with, `prompt.md`. */
const PROMPT_FIELDS: LogicFields = { body: 'prompt' };

export class AiNodeDesign extends NodeDesign<AiNodeDefinition> {
  override graphAuthorNote(): string {
    return 'its description says in words what it does; everything wired into it is sent after its instructions, each input '
      + 'under its port id where there are several. config.prompt may hold instructions of its own, with {Node Description} and '
      + '{Output Definition} where the description and the output definition are to go; without it, the node is told its '
      + 'description and to answer. config.output_definition -- a JSDoc typedef, then "module.exports = <one example as plain '
      + 'JSON>;" -- says what goes out, one output port per key: one key holding text is answered in plain text on that port; '
      + 'several keys, or a value that is not text, make the answer JSON keyed as that example is, each key handed on the '
      + 'output port of the same id. Without one, the answer is plain text on its one output port, "output".';
  }

  override whatRuns(): WhatRuns {
    return this.graphRuns('Sends prompt.md -- or the standard instructions, while it says nothing of its own -- with its description '
      + 'and output.js filled in, then what arrived, each input under its port id where there are several. The answer is text on '
      + 'its one output; where output.js names several outputs or a value that is not text, it is parsed as JSON and each key '
      + 'handed on its output port.');
  }

  /** Its instructions, written from its description and definitions. */
  override generation(): Generation {
    return { kind: 'prompt', fields: PROMPT_FIELDS };
  }

  /** Always, whatever its body says: asking the model is what this node is. */
  override deployNeeds(): DeployNeeds {
    return { needsInterface: false, asksAi: true };
  }
}
