import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Sidebar, { paletteGroups } from './Sidebar';
import { NODE_BUILDERS } from './elements/registry';
import type { NodeGuiBuilder } from '../graph-editor/nodes/NodeGuiBuilder';

describe('the node palette', () => {
  it('offers every node: the page is no node, it is built on the Gui tab', () => {
    const html = renderToStaticMarkup(createElement(Sidebar, { onAddNode: () => {} }));
    const offered = [...html.matchAll(/<button[^>]*>[\s\S]*?<\/button>/g)].map((match) => match[0]);
    for (const [type, builder] of Object.entries(NODE_BUILDERS)) {
      const entry = offered.find((button) => button.includes(`aria-label="${builder.label}"`));
      expect(entry, type).toContain('draggable="true"');
    }
    expect(offered.some((button) => button.includes('disabled'))).toBe(false);
  });

  it('is its icons below 1280 pixels, each still named -- the canvas needs the room beside a node\'s panel', () => {
    const html = renderToStaticMarkup(createElement(Sidebar, { onAddNode: () => {} }));
    expect(html.match(/<aside[^>]*>/)?.[0]).toMatch(/class="[^"]*\bw-14 xl:w-\[220px\]/);
    const offered = [...html.matchAll(/<button[^>]*>[\s\S]*?<\/button>/g)].map((match) => match[0]);
    for (const button of offered) {
      expect(button).toMatch(/<span class="hidden xl:inline">[^<]+<\/span>/);
      expect(button).toMatch(/title="[^"]+: [^"]+"/);
    }
  });
});

describe('the palette\'s headings', () => {
  it('are what each kind says it goes under, in the registry\'s order', () => {
    expect(paletteGroups(Object.values(NODE_BUILDERS))).toEqual([
      { label: 'Input', types: ['start'] },
      { label: 'Processing', types: ['folder', 'ai', 'code', 'data'] },
      { label: 'Output', types: ['end'] },
      { label: 'Structure', types: ['subgraph'] },
    ]);
  });

  it('take a new kind where it says, with no line written into the palette', () => {
    // A table of kinds here was one more place a new kind had to be added to.
    const later = { nodeType: 'vision', paletteGroup: 'Processing' } as unknown as NodeGuiBuilder;
    const groups = paletteGroups([...Object.values(NODE_BUILDERS), later]);
    expect(groups.find((group) => group.label === 'Processing')!.types).toContain('vision');
  });
});
