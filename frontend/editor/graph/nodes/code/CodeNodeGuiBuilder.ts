import { lazy } from 'react';
import type { GraphNode } from '../../../document/graph';
import { ERROR_PORT } from '../../../../../graph/wiring.ts';
import { definitionsIn } from '../../../../../graph/files/definition.ts';
import { withFile } from '../../../document/model/givenFiles';
import { INK } from '../../../../deployment/gui/kit/ui/theme';
import { NodeGuiBuilder } from '../NodeGuiBuilder';
import { Code2 } from 'lucide-react';

export class CodeNodeGuiBuilder extends NodeGuiBuilder {
  readonly nodeType = 'code';

  readonly label = 'Code';

  readonly hint = 'Run JavaScript -- say what it should do, and Auto generate writes it';

  readonly example = 'e.g. Count the words in the text and return the number';

  readonly icon = Code2;

  readonly ink = INK.code;

  override readonly paletteGroup = 'Processing';

  override readonly definesItself = true;

  override readonly AdvancedPanel = lazy(() => import('./CodeNodeAdvancedPanel'));

  override portHint(side: 'inputs' | 'outputs', node: GraphNode): string {
    if (side === 'inputs') {
      const first = node.inputs[0]?.id ?? 'name';
      return `The code reads each one as inputs.${first}; input.js says what each holds.`;
    }
    const keys = node.outputs.filter((port) => port.id !== ERROR_PORT).map((port) => `${port.id}: …`);
    return `run() returns one key per output: { ${keys.join(', ') || 'output: …'} } -- output.js names them.`;
  }

  /** What it hands on is what its output definition says: the nodes it feeds are told that. */
  override describeOutput(node: GraphNode): string {
    const output = definitionsIn(node).output.trim();
    return output ? `what its output.js defines:\n${output}` : '';
  }

  /** A file dropped on it is one its input definition is written from. */
  override dropPort(node: GraphNode): 'path' | undefined {
    return node.inputs.length ? 'path' : undefined;
  }

  override withDropped(node: GraphNode, value: unknown): GraphNode {
    return withFile(node, 'input', String(value));
  }
}
