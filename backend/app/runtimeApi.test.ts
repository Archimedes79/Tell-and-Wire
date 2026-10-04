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

/** A tool serving *graph*, from a file of its own. */
async function tool(graph: unknown = ECHO): Promise<{ url: string; graphPath: string }> {
  const graphPath = join(await mkdtemp(join(tmpdir(), 'runtime-api-')), 'echo.json');
  await writeFile(graphPath, JSON.stringify(graph));
  const one = await serve({ graphPath, port: 0 });
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

/** The events a stream sends, as they arrive, until *enough* says so. */
async function listen(url: string, enough: (events: { event: string; data: Record<string, unknown> }[]) => boolean, act: () => Promise<void>) {
  const stop = new AbortController();
  const response = await fetch(url, { signal: stop.signal });
  expect(response.headers.get('content-type')).toMatch(/^text\/event-stream/);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const events: { event: string; data: Record<string, unknown> }[] = [];
  let pending = '';
  let acted = false;
  try {
    while (!enough(events)) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const blocks = pending.split('\n\n');
      pending = blocks.pop() ?? '';
      for (const block of blocks) {
        const event = /^event: (.*)$/m.exec(block)?.[1];
        const data = /^data: (.*)$/m.exec(block)?.[1];
        if (event && data) events.push({ event, data: JSON.parse(data) });
      }
      // Once it is open -- the session said once -- the round is asked for.
      if (!acted && events.length) {
        acted = true;
        await act();
      }
    }
  } finally {
    stop.abort();
  }
  return events;
}

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
    expect(typeof body.session).toBe('string');
  });

  it('runs a round the page starts and answers once it ended, keeping what the page set', async () => {
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
  }, 30_000);

  it('runs the same start point for a script in the page\'s place: a function call, sent what it sends', async () => {
    const { url } = await tool();
    const { body } = await post(`${url}/api/runtime/run`, { event: 'picked', values: { pick: 'b' } });
    expect(body).toMatchObject({ status: 'success', outputs: { said: 'picked b' } });
    // What the page holds is the page's: a call does not set it.
    expect((await get(`${url}/api/runtime/session`)).body).toMatchObject({ page: { pick: 'a' } });
  }, 30_000);

  it('starts a round to be watched by its id, and stops one on request', async () => {
    const { url } = await tool();
    const started = await post(`${url}/api/runtime/rounds`, PICK_B);
    expect(started.status).toBe(200);
    const id = started.body.round_id as string;
    let round: Record<string, unknown> = {};
    for (let i = 0; i < 100; i += 1) {
      round = (await get(`${url}/api/runtime/rounds/${id}`)).body;
      if (round.done) break;
      await new Promise((wake) => setTimeout(wake, 100));
    }
    expect(round).toMatchObject({ round_id: id, done: true, outputs: { said: 'picked b' } });
    expect((await post(`${url}/api/runtime/rounds/${id}/stop`)).body).toEqual({ stopped: true });
    expect((await get(`${url}/api/runtime/rounds/nothing`)).status).toBe(404);
  }, 30_000);

  it('turns down a name the graph does not offer, saying which it does', async () => {
    const { url } = await tool();
    const event = await post(`${url}/api/runtime/run`, { event: 'nothing' });
    expect(event.status).toBe(400);
    expect(event.body.detail).toMatch(/No event called "nothing": this graph starts on "picked"/);
    const value = await post(`${url}/api/runtime/rounds`, { values: { shown: 'typed into a display' } });
    expect(value.status).toBe(400);
    expect(value.body.detail).toMatch(/A round of the whole graph is sent nothing: send "shown" with an event -- this graph starts on "picked"/);
    const block = await post(`${url}/api/runtime/rounds`, { ...PICK_B, by: 'shown' });
    expect(block.status).toBe(400);
    expect(block.body.detail).toBe('The block "shown" does not fire "picked"; it is fired by "pick".');
  });

  it('says a graph that could not run as one: 422 from run, and the round\'s own error from rounds', async () => {
    const step = (id: string, from: string, to: string) => ({
      id, node_type: 'code', inputs: [port(from, 'input')], outputs: [port(to, 'output')],
      config: { code: `function run(i) { return { ${to}: i.${from} }; }` },
    });
    const { url } = await tool({
      metadata: { name: 'Loop', description: 'Two nodes waiting for each other.' },
      nodes: [step('a', 'x', 'y'), step('b', 'y', 'x')],
      edges: [
        { id: 'ab', source_node_id: 'a', source_port_id: 'y', target_node_id: 'b', target_port_id: 'y' },
        { id: 'ba', source_node_id: 'b', source_port_id: 'x', target_node_id: 'a', target_port_id: 'x' },
      ],
    });
    const ran = await post(`${url}/api/runtime/run`);
    expect(ran.status).toBe(422);
    expect(ran.body.detail).toMatch(/^The graph could not run: .*cycle/i);
    const started = await post(`${url}/api/runtime/rounds`);
    expect(started.status).toBe(200);
    let round: Record<string, unknown> = {};
    for (let i = 0; i < 50 && !round.done; i += 1) {
      round = (await get(`${url}/api/runtime/rounds/${started.body.round_id as string}`)).body;
      if (!round.done) await new Promise((wake) => setTimeout(wake, 50));
    }
    expect(round).toMatchObject({ done: true, error: expect.stringMatching(/cycle/i) });
  });

  it('answers for its own session only: another id is a frontend to send back to the interface', async () => {
    const { url } = await tool();
    const { body } = await get(`${url}/api/runtime/interface`);
    expect((await get(`${url}/api/runtime/session?session=${body.session as string}`)).status).toBe(200);
    const other = await get(`${url}/api/runtime/session?session=someone-else`);
    expect(other.status).toBe(404);
    expect(other.body.detail).toMatch(/No session "someone-else" here/);
  });

  it('forgets on reset what using the graph left behind', async () => {
    const { url, graphPath } = await tool();
    await post(`${url}/api/runtime/run`, PICK_B);
    const { status, body } = await post(`${url}/api/runtime/reset`);
    expect(status).toBe(200);
    expect(body).toMatchObject({ page: { pick: 'a', shown: null }, shown: {}, outputs: {}, rounds: 0 });
    expect(existsSync(`${graphPath}.state.json`)).toBe(false);
  }, 30_000);

  it('streams the session on connect, then each round as it starts and ends, whoever started it', async () => {
    const { url } = await tool();
    const events = await listen(
      `${url}/api/runtime/stream`,
      (seen) => seen.some((one) => one.event === 'session' && one.data.rounds === 1) && seen.some((one) => one.event === 'round' && one.data.done === true),
      async () => { await post(`${url}/api/runtime/rounds`, PICK_B); },
    );
    expect(events[0]).toMatchObject({ event: 'session', data: { page: { pick: 'a' }, rounds: 0 } });
    const rounds = events.filter((one) => one.event === 'round').map((one) => one.data);
    expect(rounds[0]).toMatchObject({ done: false });
    expect(rounds.at(-1)).toMatchObject({ done: true, outputs: { said: 'picked b' } });
    expect(events.find((one) => one.event === 'session' && one.data.rounds === 1)?.data).toMatchObject({ page: { pick: 'b' }, outputs: { said: 'picked b' } });
  }, 30_000);
});
