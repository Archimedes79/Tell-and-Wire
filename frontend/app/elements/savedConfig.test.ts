/**
 * A saved node carries what is not a default, not every field every node starts
 * with -- and the engine cannot tell the difference.
 *
 * `savedNode` drops every key that still holds its one default
 * (`baseNodeConfig`). That is only safe while the engine reads a missing key
 * the same way it reads that value, so this asks the engine's own element,
 * for every node type and every mode, the questions a run asks, and holds the
 * lean node to the full node's answers.
 */
import { describe, it, expect } from 'vitest';
import { NODE_KINDS, savedNode } from '../document/nodeKinds';
import type { GraphNode, NodeConfig } from '../graph';
import { answers as engineAnswers } from '../../test/engineAnswers';

/**
 * The engine's answers, with an ai node's provider as a run takes it: left out
 * and 'default' are one provider, the one AI setting (`lent`), and `config`
 * spells them apart.
 */
function answers(node: GraphNode): Record<string, string> {
  const all = engineAnswers(node);
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
  it.each(variants().map((node) => [`${node.node_type} (${node.config.write_mode})`, node]))(
    '%s: the engine sees the lean node exactly as the full one',
    (_name, node) => {
      const lean = savedNode(node);
      expect(answers(lean)).toEqual(answers(node));
    },
  );

  it('writes, for a new node, only what it starts with that is no default', () => {
    // One default per key: a key a new node holds at its default says nothing
    // the engine would not assume, and is left out of its file.
    const saved = Object.fromEntries(Object.entries(NODE_KINDS).map(([type, kind]) => [type, savedNode(kind.create('n')).config]));
    expect(saved.folder).toEqual({});
    expect(saved.data).toEqual({});
    expect(saved.start).toEqual({});
    expect(saved.end).toEqual({});
    // Once, on what arrives: the default `batch_mode`, so nothing to write.
    expect(saved.ai).toEqual({});
    // No code: code.js is its stub until ✨ Code writes it.
    expect(saved.code).toEqual({});
    expect(Object.keys(saved.subgraph)).toEqual(['subgraph']);
  });

  it('saves a folder node as its folder, its file types and its subfolders, and nothing more', () => {
    const node = NODE_KINDS.folder.create('n');
    node.config = { ...node.config, path: 'data', extensions: '.csv', recursive: true };
    expect(savedNode(node).config).toEqual({ path: 'data', extensions: '.csv', recursive: true });
  });

  it('keeps any key once somebody changed it from its default', () => {
    const node = NODE_KINDS.end.create('n');
    node.config.temperature = 0.1;
    expect(savedNode(node).config.temperature).toBe(0.1);
  });
});
