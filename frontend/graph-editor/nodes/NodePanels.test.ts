import { describe, it, expect } from 'vitest';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GraphNode } from '../../app/graph';
import { NODE_KINDS } from '../../app/document/nodeKinds';
import type { NodePanelProps } from './NodeGuiBuilder';
import CodeNodePanel from './code/CodeNodePanel';
import AiNodePanel from './ai/AiNodePanel';

/**
 * A code and an ai node's panel, drawn: its text, a row per ✨ -- the button,
 * the prompt it is written with, and the file it writes: its content in a
 * box, and a chip beside it -- the files ✨ Input and ✨ Output write from,
 * ▶ Try, and its history. Nothing else: its ports, once per item, failures
 * and the model are folded away under Advanced, and its kind, id and heading
 * stand at the top of the side panel (`NodeEditor`), said once.
 *
 * The panels are imported directly, because the builders register them
 * lazily. Drawn with no project open, as a new graph is.
 */

const PANELS: Record<'code' | 'ai', ComponentType<NodePanelProps>> = { code: CodeNodePanel, ai: AiNodePanel };

function panel(node: GraphNode, props: Partial<NodePanelProps> = {}): string {
  return renderToStaticMarkup(createElement(PANELS[node.node_type as 'code' | 'ai'], {
    node, setConfig: () => {}, updateNode: () => {}, setDescription: () => {},
    generating: false, onGenerate: async () => false, ...props,
    shell: { graph: () => ({ metadata: {} as never, nodes: [node], edges: [] }), preview: async () => [], graphFile: async () => undefined, flush: () => {} },
  }));
}

/** A new node of *type*, with *config* set on top of what it starts with. */
function made(type: 'code' | 'ai', config: Record<string, unknown> = {}): GraphNode {
  const node = NODE_KINDS[type].create(type);
  return { ...node, config: { ...node.config, ...config } };
}

describe.each([
  ['code', 'CODE', '✨ Code', 'code.js'],
  ['ai', 'AI', '✨ Prompt', 'prompt.md'],
] as const)('a %s node\'s panel', (type, kind, body, file) => {
  it('is its text, a row per ✨, ▶ Try and its history -- in that order, which is the order Tab takes', () => {
    const html = panel(made(type));
    // Its kind and id are said once, above it (`NodeKind`), and not again in it.
    expect(html).not.toContain(`>${kind}</span>`);
    expect(html).not.toContain(`>${type}</code>`);
    // Each row: its button, its prompt, its file's chip and the box its content is edited in.
    const box = (from: string) => html.indexOf('data-code-field', html.indexOf(from));
    const at = [
      'aria-label="What it should do"',
      '>✨ Input</button>', 'aria-label="✨ Input prompt"', 'input.js ↗', 'aria-label="Files ✨ Input writes from"', '⟳ From the graph', '📂 Add a file…',
      '>✨ Output</button>', 'aria-label="✨ Output prompt"', 'output.js ↗', 'aria-label="Files ✨ Output writes from"',
      `>${body}</button>`, `aria-label="${body} prompt"`, `${file} ↗`,
      'aria-label="Try"', 'history.md ↗',
    ].map((mark) => html.indexOf(mark));
    expect([box('input.js ↗'), box('output.js ↗'), box(`${file} ↗`)].every((index, n, all) => index > 0 && (n === 0 || index > all[n - 1]))).toBe(true);
    expect(at.every((index) => index >= 0), String(at)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });
});
