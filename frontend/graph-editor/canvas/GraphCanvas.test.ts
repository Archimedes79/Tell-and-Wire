// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ReactFlowProvider } from 'reactflow';
import type { GraphNode } from '../../app/graph';
import { useGraphStore } from '../../app/store/graphStore';
import { NODE_KINDS } from '../../app/document/nodeKinds';
import { WIDGET_BUILDERS } from '../../app/elements/registry';
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

/** What the store is asked by hand, as a panel or a menu would ask it. */
const done = (change: () => void) => act(() => { change(); });

describe('Delete on the canvas', () => {
  it('takes the node, its wires and the block that shows it without asking, as one undo step', () => {
    // ReactFlow took a node's wires first, then the node: two steps of Ctrl+Z.
    choose('shown');
    press(card('shown'), 'Delete');
    expect(node('shown')).toBeUndefined();
    expect(store().rfEdges).toEqual([]);
    expect(store().page[0].shows).toBeUndefined();
    expect(store().past).toHaveLength(1);
    done(() => store().undo());
    expect(node('shown')).toBeDefined();
    expect(store().rfEdges.map((edge) => edge.id)).toEqual(['e']);
    expect(store().page[0].shows).toBe('shown');
  });
});
