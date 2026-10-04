import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GraphNode } from '../../../app/graph';
import { NODE_KINDS } from '../../../app/document/nodeKinds';
import StartNodePanel from './StartNodePanel';

function panel(config: Partial<GraphNode['config']>): string {
  const node = NODE_KINDS.start.create('ask');
  return renderToStaticMarkup(createElement(StartNodePanel, {
    node: { ...node, config: { ...node.config, ...config } }, setConfig: () => {}, updateNode: () => {},
    setDescription: () => {}, generating: false, onGenerate: async () => false,
  }));
}

describe('a start point\'s panel', () => {
  it('asks, of one a call starts, what it is sent for example -- and nothing of the kind of one the page starts, which says what it sends', () => {
    // Nobody on the page says what a call sends, so the parts an input wired
    // from it can take come from this.
    const html = panel({ started_by: 'call', values: { topic: 'cats' } });
    expect(html).toContain('What a call sends it, for example');
    expect(html).toContain('&quot;topic&quot;: &quot;cats&quot;');
    expect(panel({ started_by: 'page' })).not.toContain('What a call sends it');
    expect(panel({ started_by: 'itself' })).not.toContain('What a call sends it');
  });
});
