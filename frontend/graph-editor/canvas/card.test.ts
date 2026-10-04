import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReactFlowProvider } from 'reactflow';
import GraphNodeView from './GraphNodeView';
import { NODE_KINDS } from '../../app/document/nodeKinds';
import { firstLine } from '../../app/document/heading';
import { WIDGET_BUILDERS } from '../../app/elements/registry';
import type { GraphNode, GuiWidget } from '../../app/graph';

// Rendered to a string, a component reads the store's first state, not the
// one a test has since moved it to -- so which node's panel is open is
// answered here. (Vitest lifts both of these above the imports.)
const open = vi.hoisted(() => ({
  executionResult: null, editingNodeId: null as string | null,
  rfNodes: [] as { id: string; style?: { width?: number } }[],
  page: [] as GuiWidget[],
}));
vi.mock('../../app/store/graphStore', () => ({
  useGraphStore: (select: (state: typeof open) => unknown) => select(open),
}));

/** *graphNode* as its card is drawn on the canvas. */
const card = (graphNode: GraphNode, selected = false) => renderToStaticMarkup(createElement(ReactFlowProvider, null, createElement(GraphNodeView, {
  id: graphNode.id, data: { graphNode }, selected, type: 'graphNode', zIndex: 0, isConnectable: true,
  xPos: 0, yPos: 0, dragging: false,
})));

const counter = (): GraphNode => ({
  ...NODE_KINDS.code.create('count'),
  label: 'Count words',
  description: 'Count the words of each file.\nThen add them up.',
});

describe('a node\'s card', () => {
  it('says what the node is: its kind in a tag, its id, its heading, and its text\'s first line', () => {
    const html = card(counter());
    expect(html).toMatch(/uppercase[^"]*"[^>]*>Code</);
    expect(html).toContain('>count</span>');
    expect(html).toContain('>Count words</div>');
    expect(html).toMatch(/line-clamp-2[^>]*>Count the words of each file\.</);
    // The rest of the text is the panel's; the card has room for a line.
    expect(html).not.toContain('>Then add them up.');
    expect(firstLine('\n  First.\nSecond.')).toBe('First.');
  });

  it('has a dot on its edge for each port, named beside it on hover and in its title', () => {
    const single = { ...counter().inputs[0], id: 'stop', name: 'Stop words', description: 'Words not to count', multi: false };
    const node = { ...counter(), inputs: [{ ...counter().inputs[0], multi: true }, single], outputs: [{ ...counter().outputs[0], multi: true }] };
    const html = card(node);
    const handles = html.match(/class="react-flow__handle[^"]*"/g) ?? [];
    // The ◆ on top, two inputs, one output.
    expect(handles).toHaveLength(4);
    expect(html).toMatch(/title="Words not to count"/);
    expect(html).toMatch(/group-hover:opacity-100"[^>]*>Stop words</);
    // A list says so: a ring rather than a dot, and ∞ by its name. A new code
    // node's output is called what an ai node's is: "Output".
    expect(html).toContain('title="Output (a list)"');
    expect(html).toMatch(/group-hover:opacity-100"[^>]*>Output ∞</);
    // Spread down the edge: two inputs at a third and two thirds.
    expect(html).toContain('top:33.33');
    expect(html).toContain('top:66.66');
  });

  it('wears the accent and its glow while its panel is open, and not otherwise', () => {
    expect(card(counter())).not.toContain('0 0 0 6px');
    open.editingNodeId = 'count';
    try {
      const html = card(counter());
      expect(html).toContain('border:1px solid var(--ui-accent');
      expect(html).toContain('0 0 0 6px color-mix(in srgb, var(--ui-accent');
    } finally {
      open.editingNodeId = null;
    }
    // Selected on the canvas alone -- one of several, to move -- it wears it too.
    expect(card(counter(), true)).toContain('0 0 0 6px');
  });

  it('on a start point says which blocks of the page fire it and send to it, and draws where a round begins as an event', () => {
    open.page = [
      { ...WIDGET_BUILDERS.input_picker.create('file', 'CSV file'), sends_to: ['start'] },
      { ...WIDGET_BUILDERS.button.create('go', 'Go'), fires: 'start' },
    ];
    try {
      const html = card(NODE_KINDS.start.create('start'));
      expect(html).toContain('⚡ Go · sent CSV file');
      // Its one output is the amber diamond an event wears, said in its title.
      expect(html).toMatch(/title="[^"]*a round begins here, at whatever this is wired to."/);
      // No ◆ of its own: a start point is where rounds begin, not where they go.
      expect(html).not.toContain('Start here.');
    } finally {
      open.page = [];
    }
  });

  it('on an end point says which block of the page shows it', () => {
    open.page = [{ ...WIDGET_BUILDERS.plot_window.create('plot', 'Chart'), shows: 'result' }];
    try {
      expect(card(NODE_KINDS.end.create('result'))).toContain('shown on Chart');
      expect(card(counter())).not.toContain('shown on');
    } finally {
      open.page = [];
    }
  });
});
