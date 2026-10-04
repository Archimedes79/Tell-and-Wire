import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GraphNode } from '../../../app/graph';
import { NODE_KINDS } from '../../../app/document/nodeKinds';
import EndNodePanel from './EndNodePanel';

function panel(node: GraphNode): string {
  return renderToStaticMarkup(createElement(EndNodePanel, {
    node, setConfig: () => {}, updateNode: () => {},
    setDescription: () => {}, generating: false, onGenerate: async () => false,
  }));
}

describe('an end point\'s panel', () => {
  it('asks for a folder, and offers to browse for it, only when each value goes into a file of its own', () => {
    const node = NODE_KINDS.end.create('o');
    node.config.write_mode = 'directory';
    const html = panel(node);
    expect(html).toContain('>Folder</label>');
    expect(html).toContain('📂 Browse…');
    expect(panel(NODE_KINDS.end.create('o'))).not.toContain('📂 Browse…');
  });
});
