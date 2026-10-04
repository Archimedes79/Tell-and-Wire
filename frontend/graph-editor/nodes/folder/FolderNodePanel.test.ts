import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GraphNode } from '../../../app/graph';
import { NODE_KINDS } from '../../../app/document/nodeKinds';
import FolderNodePanel from './FolderNodePanel';

function panel(node: GraphNode): string {
  return renderToStaticMarkup(createElement(FolderNodePanel, {
    node, setConfig: () => {}, updateNode: () => {},
    setDescription: () => {}, generating: false, onGenerate: async () => false,
  }));
}

describe('a folder node\'s panel', () => {
  it('is the folder, its file types and its subfolders, and then the list -- no code to write', () => {
    const node = NODE_KINDS.folder.create('folder');
    expect(panel(node)).toMatch(/<button[^>]*disabled=""[^>]*>Show the files it lists<\/button>/);
    node.config.path = 'data/stories';
    const html = panel(node);
    expect(html).toContain('>Folder</label>');
    expect(html).toContain('aria-label="File types"');
    expect(html).toContain('Look into subfolders too');
    expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>Show the files it lists<\/button>/);
    // Failures are caught in Advanced, like every kind's, not here.
    expect(html).not.toContain('Catch');
    expect(html).not.toContain('✨');
  });
});
