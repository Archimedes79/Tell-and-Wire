import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { editorRoutes } from './routes.ts';
import { Refusal } from '../app/http.ts';
import { forgetSeen, loadGraph } from '../app/project/folder.ts';
import type { Graph } from '../../graph/graph.ts';

/** The editor's Save and Save as, as the page calls them. */

const routes = editorRoutes();
const loopback = { loopback: true } as never;
let dir = '';

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tell-and-wire-save-'));
});

afterEach(async () => {
  forgetSeen();
  await rm(dir, { recursive: true, force: true });
});

/** A graph of one end point, called *name*. */
const graph = (name: string): Graph => ({
  metadata: { name, description: '', gui_scheme: 'night' },
  nodes: [{ id: 'result', node_type: 'end', label: name, description: '', position: { x: 0, y: 0 }, inputs: [], outputs: [], config: {} }],
  edges: [],
}) as Graph;

const save = async (path: string, saved: Graph, replace?: boolean) => routes.saveGraph!({ path, graph: saved, ...(replace === undefined ? {} : { replace }) }, loopback);

describe('saving onto a graph that is there', () => {
  it('refuses unless the page says it replaces it: Save as onto a project\'s name replaced it, and said "Saved"', async () => {
    const tool = join(dir, 'word_stats');
    await save(tool, graph('Word stats'));
    const refused = await save(tool, graph('Other')).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(Refusal);
    expect((refused as Refusal).status).toBe(409);
    expect((refused as Refusal).extra).toEqual({ taken: true });
    expect((await loadGraph(tool)).metadata.name).toBe('Word stats');

    // Said so -- Save, or Save as after the person said replace it -- it is written.
    await save(tool, graph('Other'), true);
    expect((await loadGraph(tool)).metadata.name).toBe('Other');
  });
});
