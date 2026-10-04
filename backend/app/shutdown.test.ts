import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from './serve.ts';

/**
 * Taking a server down with work in it.
 *
 * The real sandbox: what has to be shown is that the child process a run
 * started is ended, not that a flag was set.
 */

const SLOW = 'async function run() { await new Promise((r) => setTimeout(r, 60000)); return { out: 1 }; }';
const wait = (ms: number) => new Promise((wake) => setTimeout(wake, ms));
const post = (url: string, body: unknown) => fetch(url, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('shutting a server down', () => {
  it('ends the round a page started, refuses new work meanwhile, and closes', async () => {
    const graphPath = join(await mkdtemp(join(tmpdir(), 'shutdown-')), 'graph.json');
    await writeFile(graphPath, JSON.stringify({
      metadata: { name: 'slow' },
      nodes: [{ id: 'slow', node_type: 'code', inputs: [], outputs: [{ id: 'out', name: 'out' }], config: { code: SLOW } }],
      edges: [],
    }));
    const { url, shutdown } = await serve({ graphPath, port: 0 });
    const { round_id } = await (await post(`${url}/api/runtime/rounds`, {})).json() as { round_id: string };
    await wait(300);

    const began = Date.now();
    const stopping = shutdown();
    // While the round winds down: a page may still look, nothing may start.
    const refused = await post(`${url}/api/runtime/rounds`, {});
    expect(refused.status).toBe(503);
    const seen = await (await fetch(`${url}/api/runtime/rounds/${round_id}`)).json() as { cancelled: boolean };
    expect(seen.cancelled).toBe(true);

    expect(await stopping).toEqual([]);
    expect(Date.now() - began).toBeLessThan(10_000);
    await expect(fetch(`${url}/api/runtime/session`)).rejects.toThrow();
  }, 30_000);
});
