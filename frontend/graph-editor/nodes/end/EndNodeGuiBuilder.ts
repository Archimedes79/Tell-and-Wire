import { lazy } from 'react';
import type { GraphNode } from '../../../app/graph';
import { NodeGuiBuilder } from '../NodeGuiBuilder';

/** Where a result goes, in words, for the node that makes it. */
function destination(node: GraphNode): string {
  const path = String(node.config.path ?? '').trim();
  const named = path ? ` "${path}"` : '';
  switch (node.config.write_mode) {
    case 'file': return `the run's result, also written to the file${named}: a text as it is, anything else as JSON`;
    case 'directory': return `the run's result, also written into the folder${named}, one file per value`;
    default: return 'the run\'s result';
  }
}

/** Where a round ends: an end point -- what arrives is what the graph hands back, under its name, and, if asked, a file or a folder of it. */
export class EndNodeGuiBuilder extends NodeGuiBuilder {
  readonly nodeType = 'end';

  // ── Build time ────────────────────────────────────────────────────────────

  readonly label = 'End point';

  readonly hint = 'The run\'s result, under this node\'s name -- also written to a file or a folder, if asked';

  readonly icon = '📤';

  readonly color = 'var(--ui-node-end, #3a2000)';

  override readonly paletteGroup = 'Output';

  override readonly Panel = lazy(() => import('./EndNodePanel'));

  // Its description is what the result is, which the node feeding it is told
  // (`wantsOn`): the panel asks for it in those words, beside where it goes.
  override readonly ownsDescription = true;

  // It ends a branch: nothing comes out of it. "path" is read by name.
  override readonly portEditing = { inputs: 'edit', outputs: 'none' } as const;

  override portHint(side: 'inputs' | 'outputs'): string | undefined {
    return side === 'inputs'
      ? 'Every input but “path” is the result. A wired “path” overrides the one set above.'
      : undefined;
  }

  /**
   * What the node wired into it is told this result is for: what the output
   * says it is (its description), and where it goes -- not only the value
   * port's own description, empty on every new node, which leaves a node
   * feeding "table.csv, one row per country" written for nothing in
   * particular. The path port wants what its name says.
   */
  override wantsOn(node: GraphNode, port: string): string | undefined {
    if (port === 'path') return super.wantsOn(node, port) ?? 'the path to write to, as text';
    return [super.wantsOn(node, port), node.description?.trim(), destination(node)].filter(Boolean).join('; ');
  }

  /** The file or folder it writes the result to besides, under its ports -- only while it writes one. */
  override canvasSummary(node: GraphNode): string | undefined {
    const path = String(node.config.path ?? '').trim();
    const writes = node.config.write_mode === 'file' || node.config.write_mode === 'directory';
    return writes && path ? path : undefined;
  }

}
