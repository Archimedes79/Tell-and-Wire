import { describe, it, expect, afterAll } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve, type Served } from './serve.ts';

/**
 * The runtime API: a graph used by name, over HTTP, by any frontend -- the
 * routes a hand-written page calls, and nothing it would have to know about
 * the graph to call them.
 */

const port = (id: string, kind: 'input' | 'output', field?: string) => ({
  id, name: id, kind, data_type: 'any', multi: false, required: false, description: '', ...(field ? { field } : {}),
});
/** A dropdown that fires the start point "picked" and is sent with it; a box shows the end point "said". */
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
  page: {
    blocks: [
      { id: 'pick', kind: 'select', label: 'Pick', options: 'a\nb', value: 'a', sends_to: ['picked'], fires: 'picked' },
      { id: 'shown', kind: 'text_io', mode: 'output', label: 'Shown', shows: 'said' },
    ],
  },
};
/** A round the dropdown starts, as the page starts it. */
const PICK_B = { event: 'picked', values: { pick: 'b' }, by: 'pick' };

const served: Served[] = [];
afterAll(async () => { for (const one of served) await one.shutdown(); });

/** A tool serving the echo graph, or *graph*, from a file of its own. */
async function tool(graph: unknown = ECHO, host?: string): Promise<{ url: string; graphPath: string }> {
  const graphPath = join(await mkdtemp(join(tmpdir(), 'runtime-api-')), 'echo.json');
  await writeFile(graphPath, JSON.stringify(graph));
  const one = await serve({ graphPath, port: 0, ...(host ? { host } : {}) });
  served.push(one);
  return { url: one.url, graphPath };
}

const get = async (url: string) => {
  const response = await fetch(url);
  return { status: response.status, body: await response.json() as Record<string, unknown> };
};
const post = async (url: string, body: unknown = {}) => {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
};

describe('the runtime API', () => {
  it('says what the graph offers by name, and which session that is', async () => {
    const { url } = await tool();
    const { status, body } = await get(`${url}/api/runtime/interface`);
    expect(status).toBe(200);
    expect(body).toMatchObject({
      name: 'Echo',
      description: 'Says what was picked.',
      events: [{ name: 'picked', started_by: 'page', fired_by: ['pick'], sends: [{ name: 'pick', label: 'Pick', type: 'text' }] }],
      outputs: [{ name: 'said', label: 'Said' }],
    });
    expect(body).not.toHaveProperty('values');
    // It answers for its own session only: another id is a frontend to send back to the interface.
    expect((await get(`${url}/api/runtime/session?session=${body.session as string}`)).status).toBe(200);
    expect((await get(`${url}/api/runtime/session?session=someone-else`)).status).toBe(404);
  });

  it('runs a round the page starts or a script calls, keeps what the page set beside the graph, turns down what it does not offer, and forgets on reset', async () => {
    const { url, graphPath } = await tool();
    const { status, body } = await post(`${url}/api/runtime/run`, PICK_B);
    expect(status).toBe(200);
    expect(body).toMatchObject({ status: 'success', error: null, outputs: { said: 'picked b' } });
    // Kept in the session and beside the graph -- never in it.
    expect(existsSync(`${graphPath}.state.json`)).toBe(true);
    expect(JSON.parse(await readFile(graphPath, 'utf8')).page.blocks[0].value).toBe('a');
    expect((await get(`${url}/api/runtime/session`)).body).toMatchObject({
      page: { pick: 'b', shown: 'picked b' }, shown: { shown: 'picked b' }, outputs: { said: 'picked b' }, rounds: 1,
    });

    // A script in the page's place: a function call, sent what it sends. What the page holds is the page's.
    const call = await post(`${url}/api/runtime/run`, { event: 'picked', values: { pick: 'a' } });
    expect(call.body).toMatchObject({ status: 'success', outputs: { said: 'picked a' } });
    expect((await get(`${url}/api/runtime/session`)).body).toMatchObject({ page: { pick: 'b' } });

    const unknown = await post(`${url}/api/runtime/run`, { event: 'nothing' });
    expect(unknown.status).toBe(400);
    expect(unknown.body.detail).toMatch(/No event called "nothing": this graph starts on "picked"/);
    const block = await post(`${url}/api/runtime/rounds`, { ...PICK_B, by: 'shown' });
    expect(block.status).toBe(400);
    expect(block.body.detail).toBe('The block "shown" does not fire "picked"; it is fired by "pick".');

    const reset = await post(`${url}/api/runtime/reset`);
    expect(reset.status).toBe(200);
    expect(reset.body).toMatchObject({ page: { pick: 'a', shown: null }, shown: {}, outputs: {}, rounds: 0 });
    expect(existsSync(`${graphPath}.state.json`)).toBe(false);
  }, 30_000);

  it('answers a request from a server bound beyond this machine without browsing its disk or setting the file a picker reads', async () => {
    const picker = { ...ECHO, page: { blocks: [{ id: 'pick', kind: 'input_picker', mode: 'file', send: 'path', sends_to: ['picked'], fires: 'picked' }] } };
    const here = await tool(picker);
    const there = await tool(picker, '0.0.0.0');
    const choose = { event: 'picked', by: 'pick', values: { pick: 'notes.txt' } };

    expect((await post(`${here.url}/api/runtime/run`, choose)).status).toBe(200);
    expect((await post(`${here.url}/api/files/browse`, { path: '' })).status).toBe(200);
    expect((await post(`${there.url}/api/runtime/run`, choose)).status).toBe(403);
    expect((await post(`${there.url}/api/files/browse`, { path: '' })).status).toBe(403);
  }, 30_000);
});
