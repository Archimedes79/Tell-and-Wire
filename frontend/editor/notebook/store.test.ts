import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addWindow, patchWindow, removeWindow } from '../../../gui/editor/windows/edit.ts';
import { addBlock, pageOf, startPage } from '../../../gui/editor/windows/page.ts';
import type { Windows } from '../../../gui/editor/windows/windows.ts';

// The server, as far as the document goes: each route answers what the test says it does.
const answers: Record<string, (body: { windows?: Windows; replace?: boolean }) => unknown> = {};
vi.mock('./api', async (actual) => ({
  ...(await actual<typeof import('./api')>()),
  call: vi.fn(async (route: string, body: unknown) => {
    if (!answers[route]) throw new Error(`not expected here: ${route}`);
    return answers[route](body as never);
  }),
}));

const { CallFailed } = await import('./api');
const { isDirty, useNotebook } = await import('./store');
const store = () => useNotebook.getState();
const file = (windows: Windows | null, stale = false) => ({ path: '/abs/tool', graph: { nodes: [], edges: [], metadata: {} }, project: true, windows, stale });

describe('the notebook that is open', () => {
  beforeEach(() => {
    for (const key of Object.keys(answers)) delete answers[key];
    store().start(startPage('Tool'));
  });

  it('undoes what was done -- one step for a sentence typed, one for each button -- and redo goes forward again', () => {
    const id = store().doc!.windows[0].id;
    for (const title of ['A', 'Ab', 'Abc']) store().edit((doc) => patchWindow(doc, id, { title }), 'title');
    store().edit((doc) => addBlock(doc, 'ul'));
    expect(pageOf(store().doc!)).toHaveLength(3);
    store().undo();
    expect(pageOf(store().doc!)).toHaveLength(2);
    expect(store().doc!.windows[0].title).toBe('Abc');
    store().undo();
    expect(store().doc!.windows[0].title).not.toBe('A');
    store().redo();
    expect(store().doc!.windows[0].title).toBe('Abc');
    store().edit((doc) => addBlock(doc, 'p'));
    expect(store().future).toHaveLength(0);
  });

  it('forgets what the windows made when the windows are changed, and keeps it when only the text of the page is', () => {
    const id = store().doc!.windows[0].id;
    useNotebook.setState({
      results: { [id]: { outcome: 'done', message: '', shown: {}, nodes: {} } },
      done: { ran: new Set([id]), changed: new Set() },
    });
    store().edit((doc) => addBlock(doc, 'p'));
    expect(Object.keys(store().results)).toEqual([id]);
    store().edit((doc) => patchWindow(doc, id, { title: 'Changed' }));
    expect(store().results).toEqual({});
    expect(store().done.ran.size).toBe(0);
  });

  it('says a window no longer current when an input of it is changed after it ran', () => {
    const [window] = store().doc!.windows;
    useNotebook.setState({ done: { ran: new Set([window.id]), changed: new Set() } });
    store().setValue(`${window.id}_in_text`, 'something else');
    expect(store().values[`${window.id}_in_text`]).toBe('something else');
    expect([...store().done.changed]).toEqual([window.id]);
  });

  it('closes the cells of a window that is taken away, by an edit or by undo', () => {
    store().edit((doc) => addWindow(doc, 'Second'));
    const second = store().doc!.windows[1].id;
    store().show({ window: second, dockOpen: true });
    store().undo();
    expect(store().window).toBeNull();
    store().redo();
    store().show({ window: second });
    store().edit((doc) => removeWindow(doc, second));
    expect(store().window).toBeNull();
  });

  it('opens a project made of windows, says when its graph was changed since, and refuses one made in the graph editor', async () => {
    const page = { ...startPage('Opened'), name: 'Opened' };
    answers.openWindows = () => file(page, true);
    expect(await store().open('/abs/tool')).toBe(true);
    expect(store().doc?.name).toBe('Opened');
    expect(store().stale).toBe(true);
    expect(store().path).toBe('/abs/tool');
    expect(isDirty(store())).toBe(false);

    answers.openWindows = () => file(null);
    expect(await store().open('/abs/other')).toBe(false);
    expect(store().error).toMatch(/graph editor/);
    expect(store().doc?.name).toBe('Opened');
  });

  it('counts as saved what was sent, not what is there when the write comes back, and asks before it writes over a project', async () => {
    let finish: () => void = () => {};
    answers.saveWindows = () => new Promise((resolve) => { finish = () => resolve(file(store().doc)); });
    const saving = store().save('/abs/tool');
    store().edit((doc) => addBlock(doc, 'p'));
    finish();
    expect(await saving).toBe(true);
    expect(store().path).toBe('/abs/tool');
    expect(isDirty(store())).toBe(true);

    answers.saveWindows = () => { throw new CallFailed(409, { detail: 'A project is already at /abs/x.', taken: true }); };
    expect(await store().save('/abs/x')).toBe(false);
    expect(store().taken).toBe('/abs/x');
    expect(store().error).toBe('');
    expect(store().path).toBe('/abs/tool');

    answers.saveWindows = (body) => (body.replace ? file(store().doc) : (() => { throw new Error('no'); })());
    expect(await store().save('/abs/x', true)).toBe(true);
    expect(store().taken).toBe('');
  });

  it('makes a page from a sentence when there is none, and changes the windows of the page there is, keeping its text', async () => {
    const made = startPage('Made');
    answers.describeWindows = () => ({ windows: made, explanation: 'It does.' });
    useNotebook.setState({ doc: null });
    expect(await store().describe('do it')).toBe(true);
    expect(store().doc?.name).toBe('Made');
    expect(store().explanation).toBe('It does.');

    store().edit((doc) => addBlock(doc, 'p'));
    const text = pageOf(store().doc!).find((block) => block.kind === 'p')!;
    answers.describeWindows = (body) => {
      expect(body.windows?.name).toBe('Made');
      // The model is told the windows, not the text around them.
      expect(body.windows?.page).toBeUndefined();
      return { windows: addWindow(made), explanation: '' };
    };
    expect(await store().describe('another')).toBe(true);
    expect(store().doc!.windows).toHaveLength(2);
    expect(pageOf(store().doc!).some((block) => block.id === text.id)).toBe(true);
    store().undo();
    expect(store().doc!.windows).toHaveLength(1);

    answers.describeWindows = () => { throw new Error('model down'); };
    expect(await store().describe('again')).toBe(false);
    expect(store().error).toMatch(/model down/);
    expect(store().busy).toBe('');
  });
});
