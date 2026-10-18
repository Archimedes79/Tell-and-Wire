import { describe, it, expect } from 'vitest';
import { link, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parseGraph } from '../../../../graph/graph.ts';
import { loadGraph } from '../../../deployment/project/folder.ts';
import { writeBundle } from './bundle.ts';

/**
 * A bundle is only a claim until someone runs it somewhere else.
 *
 * So this writes one into a temporary directory and runs the graph *from
 * there* — not from the repo — with the repo's own sources out of reach. That
 * is the difference between "the files were copied" and "it works".
 */

const REPO = resolve(__dirname, '..', '..', '..', '..');

function run(dir: string, args: string[] = []): Promise<{ code: number; out: string; err: string }> {
  return new Promise((fulfil, fail) => {
    const child = spawn(process.execPath, [join(dir, 'backend', 'cli', 'main.ts'), dir, ...args], {
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
      // The manifest names the version and lists exactly what is there; nothing of the editor is.
      const manifest = JSON.parse(await readFile(join(dir, 'MANIFEST.json'), 'utf8')) as { package: string; version: string; files: string[] };
      expect(manifest.package).toBe('tell-and-wire');
      expect(manifest.version).toBe((JSON.parse(await readFile(join(REPO, 'graph', 'package.json'), 'utf8')) as { version: string }).version);
      const there = (await readdir(dir, { recursive: true, withFileTypes: true })).filter((entry) => entry.isFile())
        .map((entry) => join(entry.parentPath, entry.name).slice(dir.length + 1).split('\\').join('/')).filter((path) => path !== 'MANIFEST.json');
      expect(manifest.files).toEqual(there.sort());
      expect(there.filter((path) => path.split('/').includes('editor') || path.split('/').includes('notebook') || path.startsWith('backend/architecture/'))).toEqual([]);
      expect(await readFile(join(dir, 'LICENSE'), 'utf8')).toBe(await readFile(join(REPO, 'LICENSE'), 'utf8'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 180_000);

  it('never carries a settings file, not even in a folder the tool starts on', async () => {
    const source = await mkdtemp(join(tmpdir(), 'tell-and-wire-source-'));
    const dir = await mkdtemp(join(tmpdir(), 'tell-and-wire-bundle-'));
    try {
      await mkdir(join(source, 'data'));
      await writeFile(join(source, 'data', 'a.csv'), 'x\n1\n');
      await writeFile(join(source, 'data', 'ai-settings.json'), '{"api_keys":{"openai":"sk-live-NOT-IN-A-BUNDLE"}}');
      const graph = parseGraph({
        metadata: { name: 'Key' },
        nodes: [{ id: 'result', node_type: 'end', label: 'result', position: { x: 0, y: 0 }, inputs: [], outputs: [], config: {} }],
        edges: [],
        gui: { blocks: [{ id: 'pick', kind: 'input_picker', mode: 'directory', value: 'data' }] },
      });
      await writeBundle(graph, dir, { dataFrom: source });
      expect(await readdir(join(dir, 'data'))).toEqual(['a.csv']);

      // Nor under another name: the machine's settings file may be named anything, and a link to it is still it.
      await writeFile(join(source, 'data', 'machine.json'), '{"api_keys":{"openai":"sk-live-NOT-IN-A-BUNDLE"}}');
      await link(join(source, 'data', 'machine.json'), join(source, 'data', 'copy.txt'));
      process.env.TW_SETTINGS = join(source, 'data', 'machine.json');
      const again = await mkdtemp(join(tmpdir(), 'tell-and-wire-bundle-'));
      try {
        await writeBundle(graph, again, { dataFrom: source });
        expect(await readdir(join(again, 'data'))).toEqual(['a.csv']);
      } finally {
        delete process.env.TW_SETTINGS;
        await rm(again, { recursive: true, force: true });
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
      await rm(source, { recursive: true, force: true });
    }
  });

  it('carries the built gui of a tool that has one -- the page, what it loads, the licences it links -- into web/, and serves it', async () => {
    const built = await mkdtemp(join(tmpdir(), 'tell-and-wire-built-'));
    const dir = await mkdtemp(join(tmpdir(), 'tell-and-wire-bundle-'));
    try {
      await mkdir(join(built, 'assets'));
      await writeFile(join(built, 'gui.html'), '<script src="/assets/app.js"></script><a href="licenses.txt">Licences</a>');
      await writeFile(join(built, 'assets', 'app.js'), 'x');
      await writeFile(join(built, 'licenses.txt'), 'MIT');
      await writeFile(join(built, 'unlinked.txt'), 'nobody asks for this');
      const graph = parseGraph({
        metadata: { name: 'Gui' },
        nodes: [{ id: 'result', node_type: 'end', label: 'result', position: { x: 0, y: 0 }, inputs: [], outputs: [], config: {} }],
        edges: [],
        gui: { blocks: [{ id: 'pick', kind: 'text', label: 'Text' }] },
      });
      const written = await writeBundle(graph, dir, { guiDir: built });
      expect(written).toEqual(expect.arrayContaining(['web/gui.html', 'web/assets/app.js', 'web/licenses.txt']));
      // The client a page of its own imports (`/tw/port.js`) is code the host serves: it goes along with the host.
      expect(await readFile(join(dir, 'backend', 'deployment', 'host', 'port.js'), 'utf8')).toContain('export async function connect');
      expect(written).not.toContain('web/unlinked.txt');
      expect(await readFile(join(dir, 'run.sh'), 'utf8')).toContain('--serve');
    } finally {
      await rm(dir, { recursive: true, force: true });
      await rm(built, { recursive: true, force: true });
    }
  });

  it("carries the files beside a code node's code.js, which it loads where it is handed on", async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tell-and-wire-bundle-'));
    try {
      const port = (id: string, kind: 'input' | 'output') => ({ id, name: id, kind, data_type: 'any', multi: false, required: false, description: '' });
      const graph = parseGraph({
        metadata: { name: 'Net pay' },
        nodes: [
          {
            id: 'pay', node_type: 'code', label: 'Pay', position: { x: 0, y: 0 }, inputs: [], outputs: [port('net', 'output')],
            config: { code: "function run() { return { net: require('./tax.js').net(200) + require('./rates.json').bonus }; }", 'file:tax.js': 'module.exports = { net: (gross) => gross * 0.75 };', 'file:rates.json': '{ "bonus": 100 }' },
          },
          { id: 'told', node_type: 'end', label: 'Told', position: { x: 300, y: 0 }, inputs: [port('value', 'input')], outputs: [], config: {} },
        ],
        edges: [{ id: 'e1', source_node_id: 'pay', source_port_id: 'net', target_node_id: 'told', target_port_id: 'value' }],
      });
      await writeBundle(graph, dir);
      expect(await readFile(join(dir, 'nodes', 'pay', 'tax.js'), 'utf8')).toContain('gross * 0.75');
      const { code, out } = await run(dir);
      expect(code).toBe(0);
      expect(JSON.parse(out).node_results.find((one: { node_id: string }) => one.node_id === 'told').inputs.value).toBe(250);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);

  it('carries Node.js with its licence where the editor has one, and none without the licence', async () => {
    const graph = parseGraph({
      metadata: { name: 'Gui' },
      nodes: [{ id: 'result', node_type: 'end', label: 'result', position: { x: 0, y: 0 }, inputs: [], outputs: [], config: {} }],
      edges: [],
    });
    const node = await mkdtemp(join(tmpdir(), 'tell-and-wire-node-'));
    const dir = await mkdtemp(join(tmpdir(), 'tell-and-wire-bundle-'));
    const bare = await mkdtemp(join(tmpdir(), 'tell-and-wire-bundle-'));
    try {
      await writeFile(join(node, 'node.exe'), 'a node');
      const without = await writeBundle(graph, bare, { nodeFrom: node });
      expect(without.filter((path) => path.startsWith('node/'))).toEqual([]);
      expect(await readFile(join(bare, 'README.md'), 'utf8')).toContain('Node 24 or newer');

      await writeFile(join(node, 'LICENSE'), 'Node is MIT');
      const written = await writeBundle(graph, dir, { nodeFrom: node });
      expect(written).toEqual(expect.arrayContaining(['node/node.exe', 'node/LICENSE']));
      expect(await readFile(join(dir, 'node', 'LICENSE'), 'utf8')).toBe('Node is MIT');
      expect(JSON.parse(await readFile(join(dir, 'MANIFEST.json'), 'utf8')).files).toContain('node/node.exe');
      expect(await readFile(join(dir, 'README.md'), 'utf8')).toContain('node/LICENSE');
      expect(await readFile(join(dir, 'run.cmd'), 'utf8')).toContain('node\\node.exe');
    } finally {
      await rm(dir, { recursive: true, force: true });
      await rm(bare, { recursive: true, force: true });
      await rm(node, { recursive: true, force: true });
    }
  });
});
