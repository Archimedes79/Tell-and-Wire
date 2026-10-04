import { beforeEach, describe, it, expect } from 'vitest';
import { askToDelete, deletes, removalQuestion } from './nodeRemoval';
import { NODE_KINDS } from '../../app/document/nodeKinds';
import { WIDGET_BUILDERS } from '../../app/elements/registry';
import { useGraphStore } from '../../app/store/graphStore';

const counter = { ...NODE_KINDS.code.create('count'), label: 'Count' };
const start = { ...NODE_KINDS.start.create('start'), label: 'Start' };
/** A page whose box sends to "start" and whose button fires it. */
const blocks = [
  { ...WIDGET_BUILDERS.text_io.create('box', 'Box', 'input'), sends_to: ['start'] },
  { ...WIDGET_BUILDERS.button.create('go', 'Go'), fires: 'start' },
  WIDGET_BUILDERS.text.create('title', 'Title'),
];

describe('what deleting asks first', () => {
  it('asks before a node\'s wires go with it, and what the page connects to it -- one question for both', () => {
    expect(removalQuestion([counter], 1)).toBe('Delete "Count"? Its 1 connection goes with it.');
    expect(removalQuestion([start], 0, blocks)).toBe('Delete "Start"? 2 blocks of the page lose their connection to it.');
    expect(removalQuestion([start], 2, blocks)).toBe('Delete "Start"? Its 2 connections go with it. 2 blocks of the page lose their connection to it.');
    expect(removalQuestion([counter, start], 1, blocks)).toBe('Delete 2 nodes? Their 1 connection goes with them. 2 blocks of the page lose their connection to them.');
  });

  it('does not ask about a node with nothing wired and nothing on the page connected to it', () => {
    // A confirmation for that is the kind people learn to click past, which is
    // how a confirmation stops protecting anything.
    expect(removalQuestion([counter], 0, blocks)).toBeNull();
    expect(removalQuestion([start], 0)).toBeNull();
  });
});

describe('deleting', () => {
  const store = () => useGraphStore.getState();
  beforeEach(() => {
    store().loadGraph({
      metadata: { name: 'Delete', description: '', gui_scheme: 'night' },
      nodes: [start, counter],
      edges: [{ id: 'e', source_node_id: 'start', source_port_id: 'data', target_node_id: 'count', target_port_id: 'input' }],
      page: { blocks },
    });
  });

  it('leaves the node, its wires and the page\'s connections to it, all of them, when the answer is no', () => {
    // ReactFlow took the wires first and asked about the node after: the node
    // stayed, and every wire into it was gone.
    let asked = '';
    askToDelete(['start'], [], (question) => { asked = question; return false; });
    expect(asked).toBe('Delete "Start"? Its 1 connection goes with it. 2 blocks of the page lose their connection to it.');
    expect(store().rfNodes.map((node) => node.id)).toEqual(['start', 'count']);
    expect(store().rfEdges).toHaveLength(1);
    expect(store().page).toEqual(blocks);
    expect(store().past).toHaveLength(0);
  });

  it('takes a node, its wires and what the page connected to it as one undo step', () => {
    askToDelete(['start'], [], () => true);
    expect(store().rfNodes.map((node) => node.id)).toEqual(['count']);
    expect(store().rfEdges).toHaveLength(0);
    expect(store().page.map((block) => [block.id, block.sends_to ?? null, block.fires ?? null])).toEqual([['box', null, null], ['go', null, null], ['title', null, null]]);
    store().undo();
    expect(store().rfNodes.map((node) => node.id)).toEqual(['start', 'count']);
    expect(store().rfEdges).toHaveLength(1);
    expect(store().page).toEqual(blocks);
    expect(store().past).toHaveLength(0);
  });

  it('takes a wire selected on its own without a word', () => {
    askToDelete([], ['e'], () => { throw new Error('asked'); });
    expect(store().rfEdges).toHaveLength(0);
    expect(store().rfNodes).toHaveLength(2);
  });
});

describe('the keys that delete on the canvas', () => {
  it('are Delete and Backspace, while the canvas is the view on screen', () => {
    expect(deletes('Delete', true)).toBe(true);
    expect(deletes('Backspace', true)).toBe(true);
    expect(deletes('a', true)).toBe(false);
    // Another view on screen: the canvas stays mounted behind it, and its keys are not the view's.
    expect(deletes('Delete', false)).toBe(false);
  });
});
