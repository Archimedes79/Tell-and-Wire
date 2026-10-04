import { describe, it, expect, beforeEach } from 'vitest';
import { connectToNewPoint, insertBlock, removeBlock } from './pageWrite';
import type { GraphNode } from '../../app/graph';
import { WIDGET_BUILDERS } from '../../app/elements/registry';
import { useGraphStore } from '../../app/store/graphStore';

const store = () => useGraphStore.getState();
const shown = () => store().page;
const nodes = () => store().rfNodes.map((n) => n.data.graphNode as GraphNode);
const ofType = (type: string) => nodes().filter((node) => node.node_type === type);

describe('the page', () => {
  beforeEach(() => store().newGraph());

  it('is the document\'s own list of blocks, beside its nodes, saved and undone with the graph: no blocks, no page', () => {
    insertBlock(WIDGET_BUILDERS.text.create('title', 'Title', 'heading'));
    insertBlock(WIDGET_BUILDERS.plot_window.create('chart', 'Chart'));
    expect(shown().map((w) => w.id)).toEqual(['title', 'chart']);
    expect(store().exportGraph().page).toEqual({ blocks: shown() });
    // A heading makes no node; a chart's end point is one.
    expect(ofType('end')).toHaveLength(1);
    expect(store().past).toHaveLength(2);
    store().undo();
    store().undo();
    expect(shown()).toEqual([]);
    expect(store().rfNodes).toEqual([]);
    store().redo();
    expect(shown().map((w) => w.id)).toEqual(['title']);
    removeBlock('title');
    expect(store().exportGraph()).not.toHaveProperty('page');
  });

  it('sends to the page\'s start point -- one made for it, where there is none, in the same undo step -- and fires it while nothing else does; a button always does', () => {
    insertBlock(WIDGET_BUILDERS.text_io.create('question', 'Question', 'input'));
    expect(store().past).toHaveLength(1);
    expect(ofType('start').map((node) => node.id)).toEqual(['start']);
    // Alone on the page, its Enter is what starts the graph: no setting to make.
    expect(shown()[0]).toMatchObject({ sends_to: ['start'], fires: 'start' });
    // A second box sends too, and leaves the firing to the first.
    insertBlock(WIDGET_BUILDERS.text_io.create('topic', 'Topic', 'input'));
    expect(shown()[1]).toMatchObject({ sends_to: ['start'] });
    expect(shown()[1].fires).toBeUndefined();
    // A button is for nothing but firing: it fires whatever else does.
    insertBlock(WIDGET_BUILDERS.button.create('go', 'Go'));
    expect(ofType('start')).toHaveLength(1);
    expect(shown()[2]).toMatchObject({ fires: 'start' });
    expect(shown()[2].sends_to).toBeUndefined();
  });

  it('is connected to a point made for a block as asked, in one undo step: its data sent there, its event firing it, or the end point it shows', () => {
    insertBlock(WIDGET_BUILDERS.text.create('title', 'Title'));
    insertBlock(WIDGET_BUILDERS.text_io.create('box', 'Box', 'both'));
    const steps = store().past.length;
    connectToNewPoint('box', 'fires');
    expect(store().past.length).toBe(steps + 1);
    expect(shown()[1].fires).toBe('start_2');
    connectToNewPoint('box', 'sends_to');
    expect(shown()[1].sends_to).toEqual(['start', 'start_3']);
    connectToNewPoint('box', 'shows');
    expect(ofType('end').map((node) => node.id)).toEqual(['box', 'box_2']);
    expect(shown()[1].shows).toBe('box_2');
  });
});
