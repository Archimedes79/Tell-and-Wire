import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addWindow, blankPage, patchWindow, removeWindow } from '../../../gui/editor/windows/edit.ts';
import type { Windows } from '../../../gui/editor/windows/windows.ts';

// The server, as far as the notebook goes: each route answers what the test says it does.
const answers: Record<string, (body: { windows?: Windows; replace?: boolean }) => unknown> = {};
vi.mock('../api/client', async (actual) => ({
  ...(await actual<typeof import('../api/client')>()),
  call: vi.fn(async (route: string, body: unknown) => {
    if (!answers[route]) throw new Error(`not expected here: ${route}`);
    return answers[route](body as never);
  }),
  watchGeneration: async (run: (id: string) => Promise<unknown>) => run('gen-test'),
}));

const { ApiError } = await import('../api/client');
const { isDirty, useNotebook } = await import('./notebookStore');
const store = () => useNotebook.getState();

const file = (windows: Windows | null, stale = false) => ({ path: '/abs/tool', graph: { nodes: [], edges: [], metadata: {} }, project: true, windows, stale });

describe('the notebook that is open', () => {
  beforeEach(() => {
    for (const key of Object.keys(answers)) delete answers[key];
    store().start(blankPage('Tool'));
  });

  it('undoes what was done, one step for a sentence typed and one for each button, and redo goes forward again', () => {
    const id = store().doc!.windows[0].id;
    store().edit((doc) => patchWindow(doc, id, { title: 'A' }), 'title');
    store().edit((doc) => patchWindow(doc, id, { title: 'Ab' }), 'title');
    store().edit((doc) => patchWindow(doc, id, { title: 'Abc' }), 'title');
    store().edit((doc) => addWindow(doc));
    expect(store().doc!.windows).toHaveLength(2);

    store().undo();
    expect(store().doc!.windows).toHaveLength(1);
    expect(store().doc!.windows[0].title).toBe('Abc');
    store().undo();
    expect(store().doc!.windows[0].title).not.toBe('A');
    store().redo();
    expect(store().doc!.windows[0].title).toBe('Abc');
    // A new edit ends what could be redone.
    store().edit((doc) => addWindow(doc));
    expect(store().future).toHaveLength(0);
  });

  it('closes a window that undo takes away, rather than leaving the page showing one that is not there', () => {
    store().edit((doc) => addWindow(doc, 'Second'));
    const second = store().doc!.windows[1].id;
    store().select(second);
    store().undo();
    expect(store().selected).toBeNull();
    store().redo();
    store().select(second);
    store().edit((doc) => removeWindow(doc, second));
    store().select(null);
    expect(store().doc!.windows).toHaveLength(1);
  });

  it('opens a project made of windows, says when its graph was changed since, and refuses one made in the graph editor', async () => {
    const page = { ...blankPage('Opened'), name: 'Opened' };
    answers.openWindows = () => file(page, true);
    await store().open('/abs/tool');
    expect(store().doc?.name).toBe('Opened');
    expect(store().stale).toBe(true);
    expect(store().path).toBe('/abs/tool');
    expect(isDirty(store())).toBe(false);

    answers.openWindows = () => file(null);
    await store().open('/abs/other');
    expect(store().error).toMatch(/graph editor/);
    // What was open stays open.
    expect(store().doc?.name).toBe('Opened');
  });

  it('counts as saved what was sent, not what is there when the write comes back, and asks before it writes over a project', async () => {
    let finish: () => void = () => {};
    answers.saveWindows = () => new Promise((resolve) => { finish = () => resolve(file(store().doc)); });
    const saving = store().save('/abs/tool');
    store().edit((doc) => addWindow(doc));
    finish();
    expect(await saving).toBe(true);
    expect(store().path).toBe('/abs/tool');
    expect(isDirty(store())).toBe(true);

    answers.saveWindows = () => { throw new ApiError(409, { detail: 'A project is already at /abs/x.', taken: true }); };
    expect(await store().save('/abs/x')).toBe(false);
    expect(store().taken).toBe('/abs/x');
    expect(store().error).toBe('');
    // Not renamed by a save that was refused.
    expect(store().path).toBe('/abs/tool');

    answers.saveWindows = (body: { replace?: boolean }) => (body.replace ? file(store().doc) : (() => { throw new Error('no'); })());
    expect(await store().save('/abs/x', true)).toBe(true);
    expect(store().taken).toBe('');
  });

  it('makes a page from a sentence when there is none, and changes the page there is -- as a step that can be undone', async () => {
    const made = { ...blankPage('Made'), name: 'Made' };
    answers.describeWindows = () => ({ windows: made, explanation: 'It does.' });
    useNotebook.setState({ doc: null });
    expect(await store().describe('do it')).toBe(true);
    expect(store().doc?.name).toBe('Made');
    expect(store().explanation).toBe('It does.');
    expect(store().past).toHaveLength(0);

    answers.describeWindows = (body: { windows?: Windows }) => {
      expect(body.windows?.name).toBe('Made');
      return { windows: addWindow(made), explanation: '' };
    };
    expect(await store().describe('another')).toBe(true);
    expect(store().doc!.windows).toHaveLength(2);
    store().undo();
    expect(store().doc!.windows).toHaveLength(1);

    answers.describeWindows = () => { throw new Error('model down'); };
    expect(await store().describe('again')).toBe(false);
    expect(store().error).toMatch(/model down|could not make/);
    expect(store().busy).toBe('');
  });
});
