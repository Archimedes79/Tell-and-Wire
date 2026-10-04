import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GraphNode } from '../../../app/graph';
import { NODE_KINDS } from '../../../app/document/nodeKinds';
import DataNodePanel from './DataNodePanel';

/** A data node's panel, drawn as the side panel hands it: the node, its setters, and what only the side panel has. */
function panel(node: GraphNode): string {
  return renderToStaticMarkup(createElement(DataNodePanel, {
    node, setConfig: () => {}, updateNode: () => {}, setDescription: () => {},
    generating: false, onGenerate: async () => false,
    shell: { graph: () => ({ metadata: {} as never, nodes: [node], edges: [] }), preview: async () => [], graphFile: async () => undefined, flush: () => {} },
  }));
}

describe('a data node\'s panel', () => {
  it('is its text, ✨ Generate, which writes the value, and what it holds -- its kind and the value: no definitions, no ▶ Try', () => {
    const node = NODE_KINDS.data.create('memory');
    node.config.data_format = 'structure';
    node.config.data_value = { count: 2 };
    const html = panel(node);
    // ✨ Generate under its text, then its row: the prompt, the file's chip, and the box it is edited in -- the kind and the value.
    const at = ['aria-label="What it should do"', '>✨ Generate</button>', 'aria-label="✨ Data prompt"', 'data.json ↗', 'aria-label="Kind"', 'aria-label="What it holds"', 'history.md ↗']
      .map((mark) => html.indexOf(mark));
    expect(at.every((index) => index >= 0), String(at)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(html).toMatch(/<textarea[^>]*aria-label="What it holds"[^>]*>\{\n {2}&quot;count&quot;: 2\n\}<\/textarea>/);
    // One file, one ✨: the row has no button of its own beside Generate.
    for (const gone of ['>✨ Data</button>', '✨ Input', '✨ Output', 'input.js', 'output.js', '▶ Try', 'From the graph']) expect(html, gone).not.toContain(gone);
    // A text it holds is kept in data.txt.
    expect(panel(NODE_KINDS.data.create('note'))).toContain('data.txt ↗');
  });
});
