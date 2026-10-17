import { afterAll, describe, expect, it } from 'vitest';
import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { API, GUI_API } from './api.ts';
import { GUI_PORT, PORT_VERSION, portView } from './port.ts';
import { serve, type Served } from './serve.ts';
import { guiPart } from '../gui/hooks.ts';

/**
 * The GUI port: the connection points a page has to its tool, and the reference client a page of its own imports. What the architecture
 * document calls "The GUI port" is held here -- every route is placed, the server says what they are, and a client that knows only those
 * names runs a tool: describes it, starts a round, hears what came of it, keeps a state.
 */

const port = (id: string, kind: 'input' | 'output', field?: string) => ({
  id, name: id, kind, data_type: 'any', multi: false, required: false, description: '', ...(field ? { field } : {}),
});
const ECHO = {
  metadata: { name: 'Echo', description: 'Says what was picked.' },
  nodes: [
    { id: 'picked', node_type: 'start', label: 'Picked', config: {} },
    { id: 'say', node_type: 'code', inputs: [port('pick', 'input', 'pick')], outputs: [port('out', 'output')], config: { code: 'function run(i) { return { out: "picked " + i.pick }; }' } },
    { id: 'said', node_type: 'end', label: 'Said', inputs: [port('value', 'input')], config: {} },
  ],
  edges: [
    { id: 'p', source_node_id: 'picked', source_port_id: 'data', target_node_id: 'say', target_port_id: 'pick' },
    { id: 's', source_node_id: 'say', source_port_id: 'out', target_node_id: 'said', target_port_id: 'value' },
  ],
  gui: { blocks: [{ id: 'pick', kind: 'select', label: 'Pick', options: 'a\nb', value: 'a', sends_to: ['picked'], fires: 'picked' }, { id: 'shown', kind: 'text_io', mode: 'output', shows: 'said' }] },
};

const served: Served[] = [];
afterAll(async () => { for (const one of served) await one.shutdown(); });

async function tool(withGui = true): Promise<string> {
  const graphPath = join(await mkdtemp(join(tmpdir(), 'port-')), 'echo.json');
  await writeFile(graphPath, JSON.stringify(ECHO));
  const one = await serve({ graphPath, port: 0, ...(withGui ? { gui: guiPart } : {}) });
  served.push(one);
  return one.url;
}

const waitFor = async (check: () => boolean, ms = 5000) => {
  for (let waited = 0; !check() && waited < ms; waited += 25) await new Promise((wake) => setTimeout(wake, 25));
  expect(check()).toBe(true);
};

/** The reference client, as a page imports it. */
interface Client {
  version: number;
  describe(): Promise<{ interface: { name: string; events: { name: string }[] }; gui: { blocks: { id: string }[] } | null }>;
  start(event: string, ask?: Record<string, unknown>): Promise<{ round_id: string }>;
  call(event: string, ask?: Record<string, unknown>): Promise<{ status: string; outputs: Record<string, unknown> }>;
  reset(): Promise<{ rounds: number }>;
  session(): Promise<{ outputs: Record<string, unknown>; gui: Record<string, unknown> }>;
  round(id: string): Promise<{ done: boolean }>;
  watch(on: { session?: (view: unknown) => void; round?: (round: { round_id: string; done: boolean }) => void }): () => void;
  states: { list(): Promise<{ name: string }[]>; save(name: string): Promise<{ name: string }>; load(name: string): Promise<{ dropped: string[] }> };
}

describe('the GUI port', () => {
  it('places every route of the runtime API in one role, and the table says only routes there are', () => {
    const routes = Object.keys({ ...API, ...GUI_API }).filter((name) => name !== 'port').sort();
    expect(Object.keys(GUI_PORT).sort()).toEqual(routes);
    const roles = new Set(Object.values(GUI_PORT).map((point) => point.role));
    expect([...roles].sort()).toEqual(['describe', 'files', 'model', 'return', 'start', 'state']);
  });

  it('is told by the tool, by name -- the GUI route only where there is a GUI to describe', async () => {
    const view = await (await fetch(`${await tool()}/api/runtime/port`)).json() as ReturnType<typeof portView>;
    expect(view.version).toBe(PORT_VERSION);
    expect(view.points.startRound).toMatchObject({ role: 'start', method: 'POST', path: '/api/runtime/rounds', local: false });
    expect(view.points.round).toMatchObject({ role: 'return', method: 'GET', path: '/api/runtime/rounds/:id' });
    expect(view.points.saveState).toMatchObject({ role: 'state', local: true });
    expect(view.points.gui).toBeDefined();
    expect(view.points.compactChat).toMatchObject({ role: 'model', method: 'POST', local: false });
    expect(view.points.chatContext).toMatchObject({ role: 'model', method: 'GET' });
    const bare = await (await fetch(`${await tool(false)}/api/runtime/port`)).json() as ReturnType<typeof portView>;
    expect(bare.points.gui).toBeUndefined();
    expect(bare.points.chatContext).toBeUndefined();
  });

  it('is met by a page of its own through /tw/port.js, which knows no path of the runtime API', async () => {
    const url = await tool();
    const asked = await fetch(`${url}/tw/port.js`);
    expect(asked.status).toBe(200);
    expect(asked.headers.get('content-type')).toMatch(/javascript/);
    const text = await asked.text();
    expect(text).not.toContain('/api/runtime/rounds');
    expect(text).not.toContain('/api/runtime/session');

    const { connect } = await import(/* @vite-ignore */ new URL('./port.js', import.meta.url).href) as { connect: (options: { base: string }) => Promise<Client> };
    const page = await connect({ base: url });
    expect(page.version).toBe(PORT_VERSION);

    // describe
    const { interface: what, gui } = await page.describe();
    expect(what.name).toBe('Echo');
    expect(what.events.map((event) => event.name)).toEqual(['picked']);
    expect(gui!.blocks.map((block) => block.id)).toEqual(['pick', 'shown']);

    // start, and hear what comes of it (whoever began it)
    const heard: { ended: string[]; sessions: number } = { ended: [], sessions: 0 };
    const stop = page.watch({ session: () => { heard.sessions += 1; }, round: (round) => { if (round.done) heard.ended.push(round.round_id); } });
    const started = await page.start('picked', { values: { pick: 'b' }, by: 'pick' });
    expect(started.round_id).toBeTruthy();
    await waitFor(() => heard.ended.includes(started.round_id));
    stop();
    expect(heard.sessions).toBeGreaterThan(0);
    expect((await page.round(started.round_id)).done).toBe(true);
    expect((await page.session()).outputs).toMatchObject({ said: 'picked b' });

    // a call: start and wait
    expect(await page.call('picked', { values: { pick: 'a' }, by: 'pick' })).toMatchObject({ status: 'success', outputs: { said: 'picked a' } });

    // state: keep it, change it, bring it back
    expect((await page.states.save('mine')).name).toBe('mine');
    expect((await page.states.list()).map((one) => one.name)).toEqual(['mine']);
    await page.call('picked', { values: { pick: 'b' }, by: 'pick' });
    expect((await page.states.load('mine')).dropped).toEqual([]);
    expect((await page.session()).gui).toMatchObject({ pick: 'a' });

    // a refusal is the tool's own words
    await expect(page.start('nothing')).rejects.toThrow(/No event called "nothing"/);
    await expect(page.states.load('nope')).rejects.toMatchObject({ status: 404 });
    expect(await page.reset()).toMatchObject({ rounds: 0 });
  }, 30_000);

  it('is imported by the project\'s own frontend, served in place of the built one', async () => {
    const project = join(await mkdtemp(join(tmpdir(), 'port-own-')), 'tool');
    await cp(fileURLToPath(new URL('../../../examples/counter', import.meta.url)), project, { recursive: true });
    await mkdir(join(project, 'frontend'), { recursive: true });
    await writeFile(join(project, 'frontend', 'index.html'), '<title>Mine</title><script type="module">import { connect } from "/tw/port.js";</script>');
    const one = await serve({ graphPath: project, port: 0, gui: guiPart });
    served.push(one);
    expect(await (await fetch(`${one.url}/`)).text()).toContain('<title>Mine</title>');
    expect((await fetch(`${one.url}/tw/port.js`)).status).toBe(200);
  }, 30_000);
});
