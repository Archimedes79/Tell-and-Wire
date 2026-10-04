/**
 * A saved node carries what is not a default, not every field every node starts
 * with -- and a run cannot tell the difference.
 *
 * `savedNode` drops every key that still holds its one default
 * (`baseNodeConfig`). That is only safe while a run reads a missing key
 * the same way it reads that value, so this asks the node's own runner,
 * for every node type and every mode, the questions a run asks, and holds the
 * lean node to the full node's answers.
 */
import { describe, it, expect } from 'vitest';
import { NODE_KINDS, savedNode } from '../document/nodeKinds';
import type { GraphNode, NodeConfig } from '../graph';
import { answers as runAnswers } from '../../test/runAnswers';

/**
 * The runner's answers, with an ai node's provider as a run takes it: left out
 * and 'default' are one provider, the one AI setting (`lent`), and `config`
 * spells them apart.
 */
function answers(node: GraphNode): Record<string, string> {
  const all = runAnswers(node);
  const config = JSON.parse(all.config ?? '{}') as { provider?: string };
  if (config.provider === '') config.provider = 'default';
  return { ...all, config: JSON.stringify(config) };
}

/** Each node type as created, and once more in every mode that changes what it reads. */
function variants(): GraphNode[] {
  const nodes: GraphNode[] = [];
  for (const kind of Object.values(NODE_KINDS)) nodes.push(kind.create('n'));
  const output = (mode: NodeConfig['write_mode']) =>
    ({ ...NODE_KINDS.end.create('n'), config: { ...NODE_KINDS.end.create('n').config, write_mode: mode } });
  nodes.push(output('none'), output('file'), output('directory'));
  return nodes;
}

describe('NodeGuiBuilder.saved', () => {
  it('writes a lean node a run sees exactly as the full one: every node type, in every mode', () => {
    for (const node of variants()) {
      expect(answers(savedNode(node)), `${node.node_type} (${node.config.write_mode})`).toEqual(answers(node));
    }
  });
});
