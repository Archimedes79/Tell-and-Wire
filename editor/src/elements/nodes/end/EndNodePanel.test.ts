import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GraphNode, GuiWidget } from '@/graph';
import { NODE_KINDS } from '@/document/nodeKinds';
import { NODE_BUILDERS } from '@/elements/registry';
import EndNodePanel from './EndNodePanel';

// Rendered to a string, a component reads the store's first state, not the
// one a test has since moved it to -- so the graph the panel asks about is
// answered here. (Vitest lifts both of these above the imports.)
const open = vi.hoisted(() => ({ rfNodes: [] as { id: string; data: { graphNode: GraphNode } }[], page: [] as GuiWidget[] }));
vi.mock('@/store/graphStore', async (actual) => ({
  ...await actual<object>(),
  useGraphStore: (select: (state: typeof open) => unknown) => select(open),
}));

function panel(node: GraphNode): string {
  return renderToStaticMarkup(createElement(EndNodePanel, {
    node, setConfig: () => {}, updateNode: () => {},
    setDescription: () => {}, generating: false, onGenerate: async () => false,
  }));
}

describe('an end point\'s panel', () => {
  it('is handed back under the node\'s own name, always -- writing a file is only what it does besides', () => {
    // Asked "why are result and file different?": the select read as if the run's result were one more
    // place to send a value to, beside a file. It is what the end point is; a file is a copy besides.
    const node = { ...NODE_KINDS.end.create('totals'), label: 'Totals' };
    const html = panel(node);
    expect(html).toMatch(/<select[^>]*aria-label="Also write it to"[^>]*><option value="none"[^>]*>Nothing<\/option><option value="file">A file<\/option><option value="directory">A folder — one file per value<\/option><\/select>/);
    expect(html).not.toMatch(/window|Name of the result|run&#x27;s result only/i);
    expect(html).toContain('Handed back as “Totals”: a page block, a script or the command line reads it by that name.');
    // A node without a label is called by its id there, as the run keys it.
    expect(panel({ ...node, label: '' })).toContain('Handed back as “totals”');
  });

  it('says which blocks of the page show it: the page chooses the end point, never the other way round', () => {
    const node = { ...NODE_KINDS.end.create('totals'), label: 'Totals' };
    open.page = [{ id: 'sum', kind: 'text_io', mode: 'output', label: 'Sum', shows: 'totals' } as GuiWidget];
    try {
      expect(panel(node)).toContain('On the page, “Sum” shows it.');
    } finally {
      open.page = [];
    }
  });

  it('names the key its value really has when another end point has its name already', () => {
    // Two end points renamed to one label: the run keeps the second under
    // "Totals (avg)" (`resultKeys`), and its panel said the result calls it "Totals".
    const first = { ...NODE_KINDS.end.create('sum'), label: 'Totals' };
    const second = { ...NODE_KINDS.end.create('avg'), label: 'Totals' };
    open.rfNodes = [first, second].map((graphNode) => ({ id: graphNode.id, data: { graphNode } }));
    try {
      const html = panel(second);
      expect(html).toContain('Handed back as “Totals (avg)”: “Totals” is another end point&#x27;s already.');
      expect(html).not.toContain('reads it by that name');
      // The first keeps its name, and the second as the panel has it -- renamed -- is its own.
      expect(panel(first)).toContain('Handed back as “Totals”: a page block');
      expect(panel({ ...second, label: 'Averages' })).toContain('Handed back as “Averages”: a page block');
    } finally {
      open.rfNodes = [];
    }
  });

  it('asks what the result is, which the node feeding it is told, in its own words', () => {
    const node = { ...NODE_KINDS.end.create('o'), description: 'one row per country' };
    expect(panel(node)).toMatch(/<textarea[^>]*aria-label="What the result is"[^>]*>one row per country<\/textarea>/);
    // One box for it: the side panel draws no second "Description" above it.
    expect(NODE_BUILDERS.end.ownsDescription).toBe(true);
  });

  it('asks for a folder, and offers to browse for it, when each value goes into a file of its own', () => {
    const node = NODE_KINDS.end.create('o');
    node.config.write_mode = 'directory';
    const html = panel(node);
    expect(html).toContain('aria-label="Folder"');
    expect(html).toContain('📂 Browse…');
    expect(html).toContain('Each value that arrives becomes a file of its own in this folder.');
    expect(panel(NODE_KINDS.end.create('o'))).not.toContain('📂 Browse…');
  });
});
