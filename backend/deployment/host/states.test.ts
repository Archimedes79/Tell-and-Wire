import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadStateName, checkedName, listStates, loadState, saveState, statesFolderOf } from './states.ts';
import type { StateDocument } from './session.ts';

const doc = (saved_at: string, value = 1): StateDocument => ({ graph: 'T', saved_at, nodes: { count: { total: { value, default: 0 } } }, gui: {}, gui_shown: {} });
const folder = async () => join(await mkdtemp(join(tmpdir(), 'states-')), 'states');

describe('states saved under a name', () => {
  it('are named with what a file name can take, and never with a path', () => {
    expect(checkedName('  Tuesday evening ')).toBe('Tuesday evening');
    expect(checkedName('v1.2-final_ä')).toBe('v1.2-final_ä');
    for (const bad of ['', '.hidden', '../x', 'a/b', 'a\b', 'C:x', 'ends.', 'x'.repeat(65), 5, undefined]) expect(() => checkedName(bad)).toThrow(BadStateName);
  });

  it('sit in a folder beside the session\'s own file', () => {
    expect(statesFolderOf(join('tool', 'state.json'))).toBe(join('tool', 'states'));
    expect(statesFolderOf(join('here', 'echo.json.state.json'))).toBe(join('here', 'echo.json.states'));
    expect(statesFolderOf(join('here', 'other.json'))).toBe(join('here', 'other.json.states'));
  });

  it('are written, listed newest first, replaced under the same name, and read back', async () => {
    const where = await folder();
    expect(await listStates(where)).toEqual([]);
    await saveState(where, 'old', doc('2026-10-15T10:00:00.000Z'));
    await saveState(where, 'new', doc('2026-10-16T10:00:00.000Z', 2));
    expect((await listStates(where)).map((one) => one.name)).toEqual(['new', 'old']);
    await saveState(where, 'old', doc('2026-10-17T10:00:00.000Z', 3));
    expect((await listStates(where)).map((one) => one.name)).toEqual(['old', 'new']);
    expect((await loadState(where, 'new')).nodes).toEqual({ count: { total: { value: 2, default: 0 } } });
  });

  it('say what is wrong with one that is missing or was edited into something else', async () => {
    const where = await folder();
    await mkdir(where, { recursive: true });
    await writeFile(join(where, 'broken.json'), 'not json');
    await writeFile(join(where, 'odd.json'), JSON.stringify({ saved_at: 'x', nodes: [], gui: {} }));
    await writeFile(join(where, 'readme.txt'), 'hello');
    await expect(loadState(where, 'gone')).rejects.toThrow('No state called "gone" is saved here.');
    await expect(loadState(where, 'broken')).rejects.toThrow(/not JSON/);
    await expect(loadState(where, 'odd')).rejects.toThrow(/nodes and gui as objects/);
    expect(await listStates(where)).toMatchObject([{ name: 'odd' }]);
  });
});
