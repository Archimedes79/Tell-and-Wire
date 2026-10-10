import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GraphNode } from '../../app/graph';
import { NODE_KINDS } from '../../app/document/nodeKinds';
import { useGraphStore } from '../../app/store/graphStore';
import { WRITE_AFTER_MS, nodePanel } from './nodePanel';

/**
 * A node's panel with no Save and no Cancel: what is changed is written into
 * the graph a moment later, typing into one field is one undo step, and Undo
 * takes it back.
 */

const store = () => useGraphStore.getState();
const stored = (id: string) => store().rfNodes.find((item) => item.id === id)!.data.graphNode as GraphNode;
/** The node's text typed into its box, as the panel writes it (`NodeView`'s `setDescription`). */
const say = (panel: ReturnType<typeof nodePanel>, text: string) =>
  panel.change((node) => ({ ...node, description: text }), { field: 'description' });

beforeEach(() => {
  vi.useFakeTimers();
  const code = NODE_KINDS.code.create('code');
  const out = NODE_KINDS.end.create('out');
  store().loadGraph({
    metadata: { name: 'T', description: '', gui_scheme: 'night' },
    nodes: [code, out],
    edges: [{ id: 'e', source_node_id: 'code', source_port_id: 'output', target_node_id: 'out', target_port_id: 'value' }],
  });
});
afterEach(() => { vi.useRealTimers(); });

describe('a change in a node\'s panel', () => {
  it('is shown at once, in the graph a moment later; typed into one field, it is one undo step, and Undo takes it back', () => {
    const panel = nodePanel('code');
    const before = store().past.length;
    say(panel, 'C');
    expect(panel.node()?.description).toBe('C');
    expect(stored('code').description).toBe('');
    for (const text of ['C', 'Co', 'Cou', 'Count']) {
      say(panel, text);
      vi.advanceTimersByTime(WRITE_AFTER_MS);
    }
    expect(stored('code').description).toBe('Count');
    expect(store().past.length).toBe(before + 1);
    store().undo();
    expect(stored('code').description).toBe('');
    expect(panel.node()?.description).toBe('');
  });

  it('is written first by what undoes, runs or saves, so Undo takes back what was just typed and not the step before it', () => {
    store().setMetadata({ description: 'An earlier step.' });
    const panel = nodePanel('code');
    const off = panel.watch(() => {});
    say(panel, 'Typed just now.');
    store().undo();
    expect(stored('code').description).toBe('');
    expect(store().metadata.description).toBe('An earlier step.');
    off();
  });
});
