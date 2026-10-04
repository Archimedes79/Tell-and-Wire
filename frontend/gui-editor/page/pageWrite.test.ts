import { describe, it, expect, beforeEach } from 'vitest';
import { connectToNewPoint, insertBlock, moveBlock, patchBlock, removeBlock } from './pageWrite';
import type { GraphNode } from '../../app/graph';
import { WIDGET_BUILDERS } from '../../app/elements/registry';
import { useGraphStore } from '../../app/store/graphStore';

const store = () => useGraphStore.getState();
const shown = () => store().page;
const nodes = () => store().rfNodes.map((n) => n.data.graphNode as GraphNode);
const ofType = (type: string) => nodes().filter((node) => node.node_type === type);

describe('the page', () => {
  beforeEach(() => store().newGraph());

  it('is the document\'s own list of blocks, beside its nodes: a heading makes no node', () => {
    insertBlock(WIDGET_BUILDERS.text.create('title', 'Title', 'heading'));
    insertBlock(WIDGET_BUILDERS.text.create('note', 'Note'));
    expect(shown().map((w) => w.id)).toEqual(['title', 'note']);
    expect(store().rfNodes).toEqual([]);
    expect(store().exportGraph().page).toEqual({ blocks: shown() });
  });

  it('is no page when it has no blocks: nothing to save, nothing to deliver', () => {
    insertBlock(WIDGET_BUILDERS.text.create('title', 'Title'));
    removeBlock('title');
    expect(store().exportGraph()).not.toHaveProperty('page');
  });

  it('is saved, undone and redone with the graph, one step per edit', () => {
    const chart = WIDGET_BUILDERS.plot_window.create('chart', 'Chart');
    insertBlock(chart);
    expect(store().past).toHaveLength(1);
    store().undo();
    expect(shown()).toEqual([]);
    expect(store().rfNodes).toEqual([]);
    store().redo();
    expect(shown().map((w) => w.id)).toEqual(['chart']);
    expect(store().isDirty()).toBe(true);
  });
});

describe('a block put on the page', () => {
  beforeEach(() => store().newGraph());

  it('sends to the page\'s start point -- one made for it, where there is none -- and fires it while nothing else does; a button always does', () => {
    insertBlock(WIDGET_BUILDERS.text_io.create('question', 'Question', 'input'));
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

  it('makes its start point in its own undo step: one Undo takes both', () => {
    insertBlock(WIDGET_BUILDERS.button.create('go', 'Go'));
    expect(store().past).toHaveLength(1);
    store().undo();
    expect(shown()).toEqual([]);
    expect(store().rfNodes).toEqual([]);
  });

  it('leaves which start point to the person where the page starts several', () => {
    insertBlock(WIDGET_BUILDERS.button.create('a', 'A'));
    connectToNewPoint('a', 'fires');
    expect(ofType('start').map((node) => node.id)).toEqual(['start', 'start_2']);
    insertBlock(WIDGET_BUILDERS.select.create('size', 'Size'));
    expect(shown()[1].sends_to).toBeUndefined();
  });

  it('shows an end point the graph has that no block shows yet, or one made for it', () => {
    const made = store().addNode('end', { x: 0, y: 0 });
    insertBlock(WIDGET_BUILDERS.plot_window.create('chart', 'Chart'));
    expect(shown()[0]).toMatchObject({ shows: made });
    insertBlock(WIDGET_BUILDERS.table.create('table', 'Table'));
    const ends = ofType('end');
    expect(ends).toHaveLength(2);
    expect(shown()[1]).toMatchObject({ shows: ends[1].id });
    expect(ends[1].label).toBe('Table');
  });

  it('is a chat that sends, fires and shows: one block, a start point and an end point', () => {
    insertBlock(WIDGET_BUILDERS.chat.create('chat', 'Chat'));
    expect(shown()[0]).toMatchObject({ sends_to: ['start'], fires: 'start', shows: 'chat' });
    expect(ofType('start')).toHaveLength(1);
    expect(ofType('end').map((node) => node.label)).toEqual(['Chat']);
  });

  it('is made beside the nodes on the canvas, its points not on top of the first', () => {
    const code = store().addNode('code', { x: 200, y: 120 });
    insertBlock(WIDGET_BUILDERS.button.create('go', 'Go'));
    const at = (id: string) => store().rfNodes.find((n) => n.id === id)!.position;
    expect(at('start').x).toBeGreaterThanOrEqual(at(code).x + 240);
  });

  it('loses what it connected to when that point goes, in the same step', () => {
    insertBlock(WIDGET_BUILDERS.chat.create('chat', 'Chat'));
    store().deleteNodes(['start']);
    expect(shown()[0]).toMatchObject({ shows: 'chat' });
    expect(shown()[0].sends_to).toBeUndefined();
    expect(shown()[0].fires).toBeUndefined();
    store().undo();
    expect(shown()[0]).toMatchObject({ sends_to: ['start'], fires: 'start' });
  });
});

describe('a block edited on the page', () => {
  beforeEach(() => store().newGraph());

  it('keeps the keystroke that made a heading grow: the text and the height land together (B31)', () => {
    // A box that grows as it is typed into changes its block twice in one
    // keystroke: the text, then the height. The height was written onto the
    // page as it had been drawn, and put the text back from before the key.
    insertBlock({ ...WIDGET_BUILDERS.text.create('text', '', 'heading'), value: 'Hel', w: 16, h: 1 });
    const undo = store().past.length;
    patchBlock('text', { value: 'Hell' });
    patchBlock('text', { h: 2 });
    expect(shown()[0]).toMatchObject({ value: 'Hell', h: 2 });
    expect(store().past.length).toBe(undo + 2);
  });

  it('changes a block on the page as it is by then, keeping what was added, renamed and deleted meanwhile', () => {
    // A change that lands late -- an answer from the engine -- wrote back the
    // page from when it was asked for.
    insertBlock(WIDGET_BUILDERS.plot_window.create('chart', 'Chart'));
    insertBlock(WIDGET_BUILDERS.text.create('gone', 'Gone'));
    patchBlock('chart', { label: 'Renamed' });
    removeBlock('gone');
    insertBlock(WIDGET_BUILDERS.text.create('added', 'Added'));

    patchBlock('chart', { tone: 'accent' });

    expect(shown().map((w) => [w.id, w.label])).toEqual([['chart', 'Renamed'], ['added', 'Added']]);
    expect(shown()[0].tone).toBe('accent');
  });

  it('is changed here when a block is set on the Gui tab, too: what it holds already is no undo step', () => {
    // (Used in the running application or a tool, a block changes no
    // document: what it holds there is the session's.)
    insertBlock({ ...WIDGET_BUILDERS.text_io.create('ask', 'Ask'), value: 'hello' });
    const undo = store().past.length;
    patchBlock('ask', { value: 'hello' });
    expect(store().past.length).toBe(undo);
    patchBlock('ask', { value: 'hello there' });
    expect(shown()[0].value).toBe('hello there');
    expect(store().past.length).toBe(undo + 1);
  });

  it('takes what is typed into a block as one undo step, as a node\'s panel does: fifty characters were fifty', () => {
    // Fifty steps pushed the node deleted before them out of the undo history.
    const count = store().addNode('code', { x: 0, y: 0 });
    insertBlock(WIDGET_BUILDERS.chat.create('chat', 'Chat'));
    store().deleteNodes([count]);
    const typed = 'What does this graph count, and where does it look?';
    for (let at = 1; at <= typed.length; at += 1) patchBlock('chat', { value: { messages: [], pending: typed.slice(0, at) } });
    store().undo();
    expect(shown()[0].value).toBeUndefined();
    store().undo();
    expect(store().rfNodes.map((n) => n.id)).toContain(count);
  });

  it('relabelled, takes the end point it shows along where that is still called after it -- labels only, in the same step', () => {
    // Rebuilt by hand: a table relabelled "Word counts" kept showing an end
    // point called "Table", on the canvas and in the App tab.
    insertBlock(WIDGET_BUILDERS.table.create('table', 'Table'));
    const steps = store().past.length;
    for (const typed of ['Table!', 'Word counts']) patchBlock('table', { label: typed });
    expect(ofType('end').map((node) => [node.id, node.label])).toEqual([['table', 'Word counts']]);
    expect(store().past.length).toBe(steps + 1);
    store().undo();
    expect(ofType('end')[0].label).toBe('Table');
    expect(shown()[0].label).toBe('Table');
    // An end point given a name of its own keeps it.
    store().updateNode('table', { label: 'Counted' });
    patchBlock('table', { label: 'Totals' });
    expect(ofType('end')[0].label).toBe('Counted');
    // A block of no label made "Result"; named, its point is named after it,
    // apart from the others.
    insertBlock(WIDGET_BUILDERS.plot_window.create('chart', ''));
    insertBlock(WIDGET_BUILDERS.plot_window.create('pie', ''));
    expect(ofType('end').map((node) => node.label)).toEqual(['Counted', 'Result', 'Result 2']);
    patchBlock('pie', { label: 'Counted' });
    expect(ofType('end').map((node) => node.label)).toEqual(['Counted', 'Result', 'Counted 2']);
  });

  it('changes nothing when the block was deleted meanwhile: not even an undo step', () => {
    insertBlock(WIDGET_BUILDERS.text.create('a', 'A'));
    const before = JSON.stringify(store().exportGraph());
    const undo = store().past.length;
    patchBlock('chart', { label: 'x' });
    expect(JSON.stringify(store().exportGraph())).toBe(before);
    expect(store().past.length).toBe(undo);
  });

  it('moves a block by place or onto another, and leaves no page with its last one', () => {
    for (const id of ['a', 'b', 'c']) insertBlock({ ...WIDGET_BUILDERS.text.create(id), id });
    moveBlock('c', 0);
    expect(shown().map((w) => w.id)).toEqual(['c', 'a', 'b']);
    moveBlock('c', 'b');
    expect(shown().map((w) => w.id)).toEqual(['a', 'b', 'c']);
    moveBlock('a', 7);
    expect(shown().map((w) => w.id)).toEqual(['a', 'b', 'c']);
    insertBlock(WIDGET_BUILDERS.divider.create('d', ''), 1);
    expect(shown().map((w) => w.id)).toEqual(['a', 'd', 'b', 'c']);
    for (const id of ['a', 'd', 'b', 'c']) removeBlock(id);
    expect(shown()).toEqual([]);
  });
});

describe('a point made for a block', () => {
  beforeEach(() => store().newGraph());

  it('is connected as asked, in one undo step: its data sent there, its event firing it, or the end point it shows', () => {
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

  it('is named apart from the points of its kind there are', () => {
    // Rebuilt by hand: a dropdown's new start point was "Start" beside "Start",
    // and the App tab and the round line could not tell them apart.
    insertBlock(WIDGET_BUILDERS.text_io.create('box', 'Box', 'both'));
    connectToNewPoint('box', 'sends_to');
    connectToNewPoint('box', 'shows');
    expect(ofType('start').map((node) => node.label)).toEqual(['Start', 'Start 2']);
    expect(ofType('end').map((node) => node.label)).toEqual(['Box', 'Box 2']);
    store().addNode('start', { x: 0, y: 0 });
    expect(ofType('start').map((node) => node.label)).toEqual(['Start', 'Start 2', 'Start 3']);
  });
});
