import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GraphNode } from '@/graph';
import { NODE_KINDS } from '@/document/nodeKinds';
import StartNodePanel from './StartNodePanel';

// Rendered to a string, a component reads the store's first state: whether
// the canvas is inside a node's graph is answered here.
const open = vi.hoisted(() => ({ subgraphStack: [] as unknown[] }));
vi.mock('@/store/graphStore', () => ({
  useGraphStore: (select: (state: typeof open) => unknown) => select(open),
}));

function panel(config: Partial<GraphNode['config']>): string {
  const node = NODE_KINDS.start.create('ask');
  return renderToStaticMarkup(createElement(StartNodePanel, {
    node: { ...node, config: { ...node.config, ...config } }, setConfig: () => {}, updateNode: () => {},
    setDescription: () => {}, generating: false, onGenerate: async () => false,
  }));
}

describe('a start point\'s panel', () => {
  it('asks, of one a call starts, what it is sent for example: what a run of it on its own is sent, and what an input can take', () => {
    // Nobody on the page says what a call sends, so the parts an input wired
    // from it can take come from this.
    const html = panel({ started_by: 'call', values: { topic: 'cats' } });
    expect(html).toContain('What a call sends it, for example');
    expect(html).toContain('&quot;topic&quot;: &quot;cats&quot;');
    expect(html).toContain('An input wired from here can take one of its parts.');
  });

  it('asks nothing of the kind of one the page starts: the page says what it sends', () => {
    expect(panel({ started_by: 'page' })).not.toContain('What a call sends it');
    expect(panel({ started_by: 'itself' })).not.toContain('What a call sends it');
  });

  it('says, in a node\'s graph, that the graph above sends it under its id -- not under the example\'s keys', () => {
    // Rebuilt by hand: the example of a start point in a subgraph was keyed
    // "text", the graph above sent its value under "ask", and a run returned
    // nothing with nothing said.
    open.subgraphStack = [{}];
    try {
      expect(panel({ started_by: 'call', values: { text: 'Hello' } })).toContain('The graph above sends it its value under &quot;ask&quot;');
      expect(panel({ started_by: 'call', values: { ask: 'Hello' } })).toContain('An input wired from here can take one of its parts.');
    } finally {
      open.subgraphStack = [];
    }
    // At the top, a call names what it sends as it likes.
    expect(panel({ started_by: 'call', values: { text: 'Hello' } })).not.toContain('The graph above');
  });
});
