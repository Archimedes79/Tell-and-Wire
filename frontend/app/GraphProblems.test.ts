import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Graph } from './graph';
import GraphProblems from './GraphProblems';

/** A Go button that fires the start point *fires*, and a box that shows what reaches the end point. */
const tool = (fires: string) => ({
  metadata: { name: 'One' },
  nodes: [
    { id: 'go', node_type: 'start', label: 'Go', description: '', position: { x: 0, y: 0 }, inputs: [], outputs: [], config: {} },
    { id: 'shown', node_type: 'end', label: 'Shown', description: '', position: { x: 0, y: 0 }, outputs: [], config: {},
      inputs: [{ id: 'value', name: 'Value', kind: 'input', data_type: 'any', multi: false, required: false, description: '' }] },
  ],
  edges: [{ id: 'e', source_node_id: 'go', source_port_id: 'data', target_node_id: 'shown', target_port_id: 'value' }],
  page: {
    blocks: [
      { id: 'press', kind: 'button', label: 'Go', tone: 'plain', fires },
      { id: 'answer', kind: 'text_io', mode: 'output', label: 'Answer', tone: 'plain', shows: 'shown' },
    ],
  },
});
const said = (graph: unknown) => renderToStaticMarkup(createElement(GraphProblems, { graph: graph as Graph }));

describe('a graph about to be loaded from outside -- designed by ✨ Describe a graph, pasted as JSON', () => {
  it('has what `check` finds in it said before Load: a button firing a start point the graph lacks', () => {
    // Loaded without a word, the button would have started nothing.
    const html = said(tool('gone'));
    expect(html).toContain('This graph has 2 problems. Load takes it as it is.');
    expect(html).toContain('It fires &quot;gone&quot;, which is no start point of the graph');
  });

  it('says so when it cannot be read as a graph at all', () => {
    expect(said({ nodes: [{ label: 'No id' }], edges: [] })).toContain('Not a node: every node needs an id and a node_type.');
  });

  it('says nothing of a sound one', () => {
    expect(said(tool('go'))).toBe('');
  });
});
