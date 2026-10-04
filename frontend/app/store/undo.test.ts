import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { COALESCE_MS, useGraphStore } from './graphStore';

const store = () => useGraphStore.getState();
const nodeCount = () => store().rfNodes.length;

describe('undo / redo', () => {
  beforeEach(() => {
    store().loadGraph({ metadata: { name: 'Undo test', description: '', gui_scheme: 'night' }, nodes: [], edges: [] });
  });

  it('is one step per change: a loaded graph has none, a new change drops the redo branch, and back at the saved state reads clean', () => {
    expect(store().past).toHaveLength(0);
    store().addNode('code', { x: 0, y: 0 });
    store().markSaved();
    store().addNode('end', { x: 100, y: 0 });
    store().addNode('data', { x: 200, y: 0 });
    expect(store().isDirty()).toBe(true);

    store().undo();
    expect(nodeCount()).toBe(2);
    store().redo();
    expect(nodeCount()).toBe(3);
    store().undo();
    store().undo();
    expect(nodeCount()).toBe(1);
    expect(store().isDirty()).toBe(false);

    store().addNode('end', { x: 0, y: 0 });
    expect(store().future).toHaveLength(0);
    // Undoing into the previous document would restore nodes that no longer belong to the one open.
    store().loadGraph({ metadata: store().metadata, nodes: [], edges: [] });
    expect(store().past).toHaveLength(0);
    expect(store().future).toHaveLength(0);
  });

  it('deleting a wired node is one step: undone, the node comes back with its wire', () => {
    store().addNode('code', { x: 0, y: 0 });
    store().addNode('end', { x: 200, y: 0 });
    const [source, target] = store().rfNodes.map((n) => n.id);
    store().commit();
    store().setRFEdges([{ id: 'e1', source, target, sourceHandle: 'result', targetHandle: 'value' } as never]);

    store().deleteNodes([source]);
    expect(nodeCount()).toBe(1);
    expect(store().rfEdges).toHaveLength(0);

    store().undo();
    expect(nodeCount()).toBe(2);
    expect(store().rfEdges).toHaveLength(1);
  });

  describe('a change typed into one field', () => {
    // A panel writes what is typed as it is typed, a moment later each time:
    // one undo step per keystroke was fifty steps for a sentence.
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });
    const label = () => store().rfNodes[0].data.graphNode.label;
    const typed = (text: string, key = 'code: label') => store().updateNode(store().rfNodes[0].id, { label: text }, undefined, key);

    it('is one undo step, however many writes it took -- until a pause, or a change to another field', () => {
      store().addNode('code', { x: 0, y: 0 });
      const before = label();
      for (const text of ['W', 'Wo', 'Wor', 'Word']) { typed(text); vi.advanceTimersByTime(500); }
      expect(label()).toBe('Word');
      store().undo();
      expect(label()).toBe(before);

      typed('One');
      vi.advanceTimersByTime(COALESCE_MS + 1);
      typed('Two');
      typed('Three', 'code: description');
      store().undo();
      expect(label()).toBe('Two');
      store().undo();
      expect(label()).toBe('One');
    });
  });
});
