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
    expect(html).toContain('aria-label="Folder"');
    expect(html).toContain('aria-label="File types"');
    expect(html).toContain('Look into subfolders too');
    expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>Show the files it lists<\/button>/);
    // Where a folder chosen on the page comes in.
    expect(html).toContain('A path wired into its “Path” port is listed instead');
    // Choosing some of the files is a code node after it, said in one line.
    expect(html).toContain('To use only some of them, wire a code node after it');
    expect(html).not.toContain('✨');
  });
});
