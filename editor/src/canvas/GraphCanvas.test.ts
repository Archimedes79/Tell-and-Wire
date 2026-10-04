// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ReactFlowProvider } from 'reactflow';
import type { GraphNode } from '@/graph';
import { useGraphStore } from '@/store/graphStore';
import { NODE_KINDS } from '@/document/nodeKinds';
import { WIDGET_BUILDERS } from '@/elements/registry';
import GraphCanvas from './GraphCanvas';

/**
 * The canvas in a page, used with a mouse and a keyboard: what a click, a
 * drag and a key do to the graph and to its undo steps -- ReactFlow's events
 * as they arrive, not the store's actions called by hand.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const store = () => useGraphStore.getState();
const node = (id: string) => store().rfNodes.find((item) => item.id === id)?.data.graphNode as GraphNode | undefined;
let root: Root;
let screen: HTMLElement;

/** A code node wired to an end point, which a block of the page shows. */
beforeEach(async () => {
  const answer = { ...WIDGET_BUILDERS.text_io.create('answer', 'Answer', 'output'), shows: 'shown' };
  store().loadGraph({
    metadata: { name: 'Canvas', description: '', gui_scheme: 'night' },
    nodes: [
      { ...NODE_KINDS.code.create('count'), label: 'Count' },
      { ...NODE_KINDS.end.create('shown'), position: { x: 400, y: 0 } },
    ],
    edges: [
      { id: 'e', source_node_id: 'count', source_port_id: 'output', target_node_id: 'shown', target_port_id: 'value' },
    ],
    page: { blocks: [answer] },
  });
  screen = document.createElement('div');
  document.body.appendChild(screen);
  root = createRoot(screen);
  await act(async () => {
    root.render(createElement(ReactFlowProvider, null, createElement(GraphCanvas, { active: true, onOpenPage: () => {} })));
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => { root.unmount(); });
  screen.remove();
});

/** The card of node *id*, as ReactFlow draws it. */
const card = (id: string): HTMLElement => screen.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`)!;

/**
 * A mouse event of *type* on *target*, at *x*, *y* on the screen. Handled at
 * once: a canvas of no size, as it is here, pans by itself on every frame of
 * a drag, and a wait for React to settle would wait for that.
 */
function mouse(target: EventTarget, type: string, x = 10, y = 10): void {
  act(() => {
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0, clientX: x, clientY: y }));
  });
}

/** Node *id* clicked: chosen, and the keys are pressed on it. */
function choose(id: string): void {
  mouse(card(id), 'mousedown');
  mouse(card(id), 'mouseup');
  mouse(card(id), 'click');
  act(() => { card(id).focus(); });
}

/** *key* pressed on *target*, and let go. */
function press(target: EventTarget, key: string): void {
  for (const type of ['keydown', 'keyup']) {
    act(() => { target.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, cancelable: true })); });
  }
}

/** Every question asked, answered *yes* or not. */
function answering(yes: boolean): string[] {
  const asked: string[] = [];
  vi.spyOn(window, 'confirm').mockImplementation((question) => { asked.push(String(question)); return yes; });
  return asked;
}

/** What the store is asked by hand, as a panel or a menu would ask it. */
const done = (change: () => void) => act(() => { change(); });

describe('a node on the canvas', () => {
  it('is chosen by a click, which changes nothing: Redo is still there, and Undo takes back the step before', () => {
    done(() => store().updateNode('count', { label: 'Counted' }));
    done(() => store().undo());
    mouse(card('count'), 'mousedown');
    mouse(card('count'), 'mouseup');
    mouse(card('count'), 'click');
    // Chosen: its panel opens.
    expect(store().editingNodeId).toBe('count');
    // And nothing else: the click used to be a drag begun, an undo step that threw Redo away.
    expect(store().past).toHaveLength(0);
    done(() => store().redo());
    expect(node('count')!.label).toBe('Counted');
  });

  it('moved, is one undo step', () => {
    const at = store().rfNodes.find((item) => item.id === 'count')!.position;
    mouse(card('count'), 'mousedown', 10, 10);
    for (const x of [20, 40, 60]) mouse(window, 'mousemove', x, 10);
    mouse(window, 'mouseup', 60, 10);
    expect(store().rfNodes.find((item) => item.id === 'count')!.position.x).toBeGreaterThan(at.x);
    expect(store().past).toHaveLength(1);
    done(() => store().undo());
    expect(store().rfNodes.find((item) => item.id === 'count')!.position).toEqual(at);
  });
});

describe('Delete on the canvas', () => {
  it('asks once about an end point -- its wires, and the block that shows it -- and on a no leaves it as it was', () => {
    // ReactFlow took a node's wires, then asked about the node: kept on
    // Cancel, it was kept with none.
    const asked = answering(false);
    choose('shown');
    press(card('shown'), 'Delete');
    expect(node('shown')).toBeDefined();
    expect(store().rfEdges.map((edge) => edge.id)).toEqual(['e']);
    expect(store().page[0].shows).toBe('shown');
    expect(store().past).toHaveLength(0);
    expect(asked).toEqual(['Delete "Result"? Its 1 connection goes with it. 1 block of the page loses its connection to it.']);
  });

  it('takes a node and its wires as one undo step', () => {
    answering(true);
    choose('count');
    press(card('count'), 'Delete');
    expect(node('count')).toBeUndefined();
    expect(store().rfEdges).toEqual([]);
    // One Ctrl+Z brings back the node and its wires: it took two.
    done(() => store().undo());
    expect(node('count')).toBeDefined();
    expect(store().rfEdges.map((edge) => edge.id)).toEqual(['e']);
  });

  it('deletes nothing when pressed anywhere but on the canvas', () => {
    answering(true);
    choose('count');
    // In a field beside it, as the node's panel is.
    const field = document.createElement('input');
    document.body.appendChild(field);
    act(() => { field.focus(); });
    press(field, 'Delete');
    field.remove();
    expect(node('count')).toBeDefined();
  });

  it('asks what the card\'s ✕ asks: an end point a block shows, wired to nothing, is not deleted without a word', () => {
    const asked = answering(false);
    done(() => store().setRFEdges([]));
    act(() => { screen.querySelector<HTMLElement>('[aria-label="Delete node Result"]')!.click(); });
    expect(asked).toEqual(['Delete "Result"? 1 block of the page loses its connection to it.']);
    expect(node('shown')).toBeDefined();
  });
});
