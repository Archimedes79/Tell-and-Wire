import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
  dir = await mkdtemp(join(tmpdir(), 'ai-graph-save-'));
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
    // Rebuilt by hand: File ▸ Save as… onto an existing project's folder name
    // wrote over that project, its node folders gone, with "Saved to …".
    const tool = join(dir, 'word_stats');
    await save(tool, graph('Word stats'));
    const refused = await save(tool, graph('Other')).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(Refusal);
    expect((refused as Refusal).status).toBe(409);
    expect((refused as Refusal).extra).toEqual({ taken: true });
    expect((refused as Refusal).message).toContain(`A project is already at ${tool}`);
    expect((await loadGraph(tool)).metadata.name).toBe('Word stats');

    // Said so -- Save, or Save as after the person said replace it -- it is written.
    await save(tool, graph('Other'), true);
    expect((await loadGraph(tool)).metadata.name).toBe('Other');
  });

  it('refuses for a graph file too, and writes a new one without asking', async () => {
    const file = join(dir, 'tool.json');
    await writeFile(file, JSON.stringify(graph('Kept')));
    await expect(save(file, graph('Other'))).rejects.toThrow(/A graph file is already at/);
    expect(JSON.parse(await readFile(file, 'utf8')).metadata.name).toBe('Kept');

    const fresh = join(dir, 'fresh');
    expect(await save(fresh, graph('Fresh'))).toMatchObject({ path: fresh, project: true });
    expect(existsSync(join(fresh, 'flow.json'))).toBe(true);
  });
});
