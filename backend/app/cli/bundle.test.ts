import { describe, it, expect } from 'vitest';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadGraph } from '../project/folder.ts';
import { writeBundle } from './bundle.ts';

/**
 * A bundle is only a claim until someone runs it somewhere else.
 *
 * So this writes one into a temporary directory and runs the graph *from
 * there* — not from the repo — with the repo's own sources out of reach. That
 * is the difference between "the files were copied" and "it works".
 */

const REPO = resolve(__dirname, '..', '..', '..');

function run(dir: string, args: string[] = []): Promise<{ code: number; out: string; err: string }> {
  return new Promise((fulfil, fail) => {
    const child = spawn(process.execPath, [join(dir, 'backend', 'app', 'main.ts'), dir, ...args], {
      cwd: dir,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = ''; let err = '';
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { err += c; });
    child.on('error', fail);
    child.on('close', (code) => fulfil({ code: code ?? -1, out, err }));
  });
}

describe('a bundle', () => {
  it('runs the graph from somewhere else entirely, carrying what runs and the terms its code comes under, and not how each node was written', async () => {
    const graph = await loadGraph(resolve(REPO, 'examples', 'population_plotter'));
    // How a node was written stays with the project: a history can hold a path nobody was meant to see.
    graph.nodes.find((node) => node.id === 'chart')!.config.history = '## 2026-09-28 10:00 · ✨ Input\n\nPrompt:\n\n```\nC:/Users/someone/private/customers.csv\n```';
    const dir = await mkdtemp(join(tmpdir(), 'tell-and-wire-bundle-'));
    try {
      await writeBundle(graph, dir, { dataFrom: REPO });
      // No `--inputs`: the CSV the picker starts on came along, at the same
      // relative path, so the tool opens on a chart rather than on an error.
      const { code, out } = await run(dir);
      expect(code).toBe(0);
      const result = JSON.parse(out);
      expect(result.status).toBe('success');
      // Not merely "it started": the chart has something to draw, and its end
      // point was handed it. A run produces the figure, never the drawing --
      // nothing here knows how big the recipient's window will be.
      const plot = result.node_results.find((n: { node_id: string }) => n.node_id === 'plot');
      expect(plot.inputs.value.kind).toBe('bars');
      expect(plot.inputs.value.points.length).toBeGreaterThan(0);

      expect(await readdir(join(dir, 'nodes', 'chart'))).not.toContain('history.md');
      expect(await readFile(join(dir, 'LICENSE'), 'utf8')).toBe(await readFile(join(REPO, 'LICENSE'), 'utf8'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 180_000);
});
