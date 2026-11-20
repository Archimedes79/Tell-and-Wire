import { describe, it, expect } from 'vitest';
import { stillBlank } from './graphChange';
import type { Graph } from '../document/graph';

const blank: Graph = { metadata: { name: 'Untitled tool', description: '', gui_scheme: 'night' }, nodes: [], edges: [] };

describe('a graph asked for on a blank tool', () => {
  it('replaces the tool only while it is still blank and as it was asked about', () => {
    const node = { id: 'start' } as Graph['nodes'][number];
    const block = { id: 'title', kind: 'text' } as NonNullable<Graph['gui']>['blocks'][number];
    expect(stillBlank(blank, blank)).toBe(true);
    expect(stillBlank(blank, { ...blank, nodes: [node] })).toBe(false);
    expect(stillBlank(blank, { ...blank, gui: { blocks: [block] } })).toBe(false);
    expect(stillBlank(blank, { ...blank, metadata: { ...blank.metadata, name: 'Renamed' } })).toBe(false);
  });
});
