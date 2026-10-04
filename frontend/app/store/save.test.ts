import { describe, it, expect, vi, beforeEach } from 'vitest';

// The server, as far as saving goes: each write waits until the test lets it
// finish, so the test can edit the graph while it is on its way.
const writes: { path: string; replace?: boolean; finish: () => void; fail: (error: Error) => void }[] = [];
vi.mock('../api/client', async (actual) => ({
  ...(await actual<typeof import('../api/client')>()),
  call: vi.fn((route: string, body: { path: string; replace?: boolean }) => {
    if (route !== 'saveGraph') throw new Error(`not expected here: ${route}`);
    return new Promise((resolve, reject) => {
      writes.push({
        path: body.path,
        replace: body.replace,
        finish: () => resolve({ path: `/abs/${body.path}`, graph: {}, project: true }),
        fail: reject,
      });
    });
  }),
}));

const { useGraphStore } = await import('./graphStore');
const store = () => useGraphStore.getState();

describe('saving the document', () => {
  beforeEach(() => {
    writes.length = 0;
    store().newGraph();
  });

  it('counts as saved what was sent, not what is there when the write comes back; saved again, it goes where it was saved to', async () => {
    store().addNode('code', { x: 0, y: 0 });
    const saving = store().save('graph');
    // An edit made while the write is on its way is not on disk.
    store().addNode('end', { x: 300, y: 0 });
    writes[0].finish();
    expect(await saving).toEqual({ path: '/abs/graph' });
    expect(store().currentFilePath).toBe('/abs/graph');
    expect(store().isDirty()).toBe(true);

    const again = store().save();
    expect(writes[1].path).toBe('/abs/graph');
    writes[1].finish();
    await again;
    expect(store().isDirty()).toBe(false);
  });

  it('marks nothing saved, and renames nothing, when the write fails or is refused', async () => {
    // A Save as refused because a project is already there left the graph called by the new name all the same.
    store().addNode('code', { x: 0, y: 0 });
    const refused = store().save('word_stats', { name: 'word_stats' });
    writes[0].fail(new Error('A project is already at word_stats.'));
    await expect(refused).rejects.toThrow();
    expect(store().metadata.name).toBe('Untitled Graph');
    expect(store().isDirty()).toBe(true);
    expect(store().currentFilePath).toBeNull();
  });

  it('writes over a graph only where it is its own file, or the person said to', async () => {
    // Save as onto another project's name replaced that project without a word. The server refuses unless the page says so.
    const saving = store().save('graph');
    expect(writes[0].replace).toBe(false);
    writes[0].finish();
    await saving;

    const again = store().save();
    expect(writes[1]).toMatchObject({ path: '/abs/graph', replace: true });
    writes[1].finish();
    await again;

    void store().save('other');
    expect(writes[2].replace).toBe(false);
    void store().save('other', { replace: true });
    expect(writes[3].replace).toBe(true);
  });
});
