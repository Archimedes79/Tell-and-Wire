import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseGraph, type Graph } from '../../../graph/graph.ts';
import { problemsIn } from './check.ts';
import { RUN_ON_ITS_OWN } from '../../../graph/nodes/code/CodeNodeRunner.ts';
import { registry } from '../../../graph/nodes/registry.ts';
import {
  FileChanged, changesOnDisk, forgetSeen, graphAt, isProjectFolder, loadGraph, readProject, saveGraph, writeProject,
} from './folder.ts';

const port = (id: string, kind: 'input' | 'output') => ({ id, name: id, kind, data_type: 'any', multi: false, required: false, description: '' });

/** A code node and an ai node, which keep writing, beside a directory input and an end point, which keep none -- and a page with a chart. */
function sample(): Graph {
  return parseGraph({
    metadata: { name: 'Sample', description: 'All the writing there is.' },
    nodes: [
      {
        id: 'folder', node_type: 'folder', label: 'Folder', position: { x: 10, y: 20 },
        inputs: [], outputs: [port('files', 'output')],
        config: { path: 'data', extensions: '.csv' },
      },
      {
        id: 'count', node_type: 'code', label: 'Count', position: { x: 300.4, y: 20 }, width: 360, height: 180,
        inputs: [port('files', 'input')], outputs: [port('total', 'output')],
        config: {
          code: 'function run(inputs) {\n  return { total: inputs.files.length };\n}',
          input_definition: 'module.exports = { "files": ["a.csv"] };',
          output_definition: 'module.exports = { "total": 1 };',
          history: '## 2026-09-28 09:05 · ✨ Code\n\nNothing was sent.',
          batch_mode: 'whole_list',
        },
      },
      {
        id: 'say', node_type: 'ai', label: 'Say it', position: { x: 600, y: 20 },
        inputs: [port('total', 'input')], outputs: [port('output', 'output')],
        config: { prompt: 'Say how many files there are, in one sentence.', temperature: 0.2 },
      },
      {
        id: 'told', node_type: 'end', label: 'Told', position: { x: 900, y: 20 },
        inputs: [port('value', 'input')], outputs: [], config: {},
      },
    ],
    edges: [
      { id: 'e1', source_node_id: 'folder', source_port_id: 'files', target_node_id: 'count', target_port_id: 'files' },
      { id: 'e2', source_node_id: 'count', source_port_id: 'total', target_node_id: 'say', target_port_id: 'total' },
      { id: 'e3', source_node_id: 'say', source_port_id: 'output', target_node_id: 'told', target_port_id: 'value' },
    ],
    page: { blocks: [{ id: 'chart', kind: 'plot_window', label: 'Chart', shows: 'told' }] },
  });
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tell-and-wire-project-'));
  forgetSeen();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const text = (path: string) => readFile(join(dir, path), 'utf8');

/** A distinct modification time, so a change within the same millisecond still shows. */
const touch = async (path: string, content: string) => {
  await writeFile(path, content);
  const later = new Date(Date.now() + 5_000);
  await utimes(path, later, later);
};

describe('a project folder', () => {
  it('keeps each piece of writing in a file named for what it is, the flow once in flow.json, and a data node\'s fields as JSON in data.json', async () => {
    await writeProject(dir, sample());
    expect(await text('nodes/count/code.js')).toBe(`function run(inputs) {\n  return { total: inputs.files.length };\n}\n\n${RUN_ON_ITS_OWN}\n`);
    expect(await text('nodes/count/input.js')).toBe('module.exports = { "files": ["a.csv"] };\n');
    expect(await text('nodes/count/output.js')).toBe('module.exports = { "total": 1 };\n');
    expect(await text('nodes/count/history.md')).toBe('## 2026-09-28 09:05 · ✨ Code\n\nNothing was sent.\n');
    expect(await text('nodes/say/prompt.md')).toBe('Say how many files there are, in one sentence.\n');
    // code.js runs on its own, on the example in input.js.
    const { stdout } = await promisify(execFile)(process.execPath, [join(dir, 'nodes/count/code.js')], { cwd: dir });
    expect(JSON.parse(stdout)).toEqual({ total: 1 });
    // A folder listing has no writing of its own, and a chart is one block of the page's: no node, no folder.
    expect(existsSync(join(dir, 'nodes/folder/select.js'))).toBe(false);
    expect(JSON.parse(await text('page/page.json'))).toEqual([{ id: 'chart', kind: 'plot_window', label: 'Chart', shows: 'told' }]);
    expect(existsSync(join(dir, 'page/chart'))).toBe(false);
    expect(existsSync(join(dir, 'nodes/page'))).toBe(false);

    // The flow says no more than who is wired to whom; a node's settings and ports are its own.
    expect(JSON.parse(await text('flow.json'))).toEqual({
      name: 'Sample',
      description: 'All the writing there is.',
      nodes: { folder: 'folder', count: 'code', say: 'ai', told: 'end' },
      wires: ['folder.files -> count.files', 'count.total -> say.total', 'say.output -> told.value'],
    });
    expect(JSON.parse(await text('nodes/count/node.json'))).toEqual({ label: 'Count', config: { batch_mode: 'whole_list' } });
    const ports = JSON.parse(await text('nodes/count/interface.json'));
    expect(ports.inputs).toEqual([{ port: 'files', type: 'any' }]);
    expect(ports.outputs).toEqual([{ port: 'total', type: 'any' }]);
    expect(JSON.stringify(ports)).not.toContain('folder');
    expect(JSON.parse(await text('layout.json')).count).toEqual({ x: 300, y: 20, width: 360, height: 180 });

    const data = (id: string, fields: Record<string, unknown>) => ({ id, node_type: 'data', label: id, inputs: [], outputs: [], config: { data_value: fields } });
    const held = join(dir, 'held');
    await writeProject(held, parseGraph({
      metadata: { name: 'Held' },
      nodes: [data('count', { count: 2, names: ['Ada'] }), data('note', { text: 'Line one.\nLine two.' })],
      edges: [],
    }));
    // A data node's fields are one file, data.json, whatever they hold; its ports follow them.
    expect(JSON.parse(await readFile(join(held, 'nodes/count/data.json'), 'utf8'))).toEqual({ count: 2, names: ['Ada'] });
    expect(JSON.parse(await readFile(join(held, 'nodes/note/data.json'), 'utf8'))).toEqual({ text: 'Line one.\nLine two.' });
    expect(JSON.parse(await readFile(join(held, 'nodes/note/interface.json'), 'utf8')).outputs.map((one: { port: string }) => one.port)).toEqual(['text', 'round', 'all', 'before']);
    // How it looks filled is a file of its own, a stub until something is written there; one that is comes back.
    expect(JSON.parse(await readFile(join(held, 'nodes/note/example.json'), 'utf8'))).toEqual({});
    forgetSeen();
    expect((await readProject(held)).nodes.map((node) => node.config.data_value)).toEqual([{ count: 2, names: ['Ada'] }, { text: 'Line one.\nLine two.' }]);
  });

  it('reads back exactly what was written', async () => {
    const original = sample();
    await writeProject(dir, original);
    const read = await readProject(dir);
    original.nodes[1].position.x = 300; // stored rounded
    // A node whose ports follow from its settings is written with them as they follow.
    for (const node of original.nodes) Object.assign(node, registry.node(node.node_type)?.derivedPorts(node, registry) ?? {});
    const sortedKeys = (value: unknown): unknown => (Array.isArray(value) ? value.map(sortedKeys)
      : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortedKeys((value as Record<string, unknown>)[key])])) : value);
    expect(sortedKeys(read.nodes)).toEqual(sortedKeys(original.nodes.map((node) => ({ ...node, width: node.width ?? null, height: node.height ?? null }))));
    // A wire is named by what it joins.
    expect(read.edges).toEqual(original.edges.map((edge) => ({
      ...edge, id: `${edge.source_node_id}.${edge.source_port_id} -> ${edge.target_node_id}.${edge.target_port_id}`,
    })));
    expect(read.metadata.name).toBe('Sample');
    expect(read.page).toEqual(original.page);
  });

  it('writes the same bytes for the same graph, so an unchanged save is no change', async () => {
    await writeProject(dir, sample());
    const files = ['flow.json', 'layout.json', 'nodes/count/node.json', 'nodes/count/interface.json', 'page/page.json'];
    const first = await Promise.all(files.map(text));
    await writeProject(dir, await readProject(dir));
    expect(await Promise.all(files.map(text))).toEqual(first);
  });

  it('removes a deleted node\'s files, and nothing a person put in a node\'s folder, however deep', async () => {
    const graph = sample();
    await writeProject(dir, graph);
    await writeFile(join(dir, 'nodes/say/notes.txt'), 'mine');
    await mkdir(join(dir, 'nodes/count/fixtures'), { recursive: true });
    await writeFile(join(dir, 'nodes/count/fixtures/code.js'), '// mine, a fixture');
    graph.nodes = graph.nodes.filter((node) => node.id !== 'say');
    graph.edges = graph.edges.filter((edge) => edge.target_node_id !== 'say' && edge.source_node_id !== 'say');
    await writeProject(dir, graph);
    expect(existsSync(join(dir, 'nodes/say/prompt.md'))).toBe(false);
    expect(await text('nodes/say/notes.txt')).toBe('mine');
    expect(await text('nodes/count/fixtures/code.js')).toBe('// mine, a fixture');
  });

  it('refuses what a folder could write and not read back: two ids that differ only in case, a wire it could not tell apart, a number for an id', async () => {
    const code = (id: string, body: string) => ({
      id, node_type: 'code', label: id, position: { x: 0, y: 0 },
      inputs: [port('in', 'input')], outputs: [port('out', 'output')], config: { code: body },
    });
    const wire = (from: string, fromPort: string) =>
      ({ id: `${from}-z`, source_node_id: from, source_port_id: fromPort, target_node_id: 'z', target_port_id: 'in' });

    const clash = parseGraph({ metadata: { name: 'Case' }, nodes: [code('Count', 'UPPER'), code('count', 'lower')], edges: [] });
    await expect(writeProject(dir, clash)).rejects.toThrow(/share a folder/);
    expect(problemsIn(clash).some((p) => /share a folder/.test(p.problem))).toBe(true);

    for (const [id, portId] of [['a->b', 'out'], [' a', 'out'], ['', 'out'], ['a', 'o->ut'], ['a', '']]) {
      const graph = parseGraph({ metadata: { name: 'Wire' }, nodes: [code(id, 'x'), code('z', 'y')], edges: [wire(id, portId)] });
      await expect(writeProject(dir, graph), JSON.stringify([id, portId])).rejects.toThrow();
      expect(problemsIn(graph).length, JSON.stringify([id, portId])).toBeGreaterThan(0);
    }

    // It would come back in another order.
    await expect(writeProject(dir, parseGraph({ metadata: { name: 'Order' }, nodes: [code('b', 'x'), code('2', 'y'), code('1', 'z')], edges: [] }))).rejects.toThrow(/is a number/);
    // Refused before anything happened.
    expect(existsSync(join(dir, 'flow.json'))).toBe(false);
  });

  it('refuses to read a page file that is no list of blocks as "no page", which a save would delete, and to save over a .json file that holds no graph', async () => {
    await writeProject(dir, sample());
    for (const wrong of ['{"blocks": []}', '{}', 'null', '[1]']) {
      await writeFile(join(dir, 'page/page.json'), wrong);
      await expect(readProject(dir), wrong).rejects.toThrow(/must be a list of blocks/);
    }

    const other = join(dir, 'package.json');
    await writeFile(other, '{"name": "not a graph"}');
    expect(graphAt(other)).toBeNull();
    await expect(saveGraph(other, sample())).rejects.toThrow(/holds no graph/);
    expect(await text('package.json')).toBe('{"name": "not a graph"}');
  });
});

describe('two editors on one folder', () => {
  it('refuses to overwrite a file changed outside since it was read, or a node another writer added, and writes nothing over either', async () => {
    const graph = sample();
    await writeProject(dir, graph);
    await touch(join(dir, 'nodes/count/code.js'), 'function run() { return { total: 1 }; }\n');
    graph.nodes[1].config.code = 'function run() { return { total: 2 }; }';
    await expect(writeProject(dir, graph)).rejects.toThrow(FileChanged);
    expect(await text('nodes/count/code.js')).toContain('total: 1');

    // The MCP server, or a second editor, adds node "extra" to the open project.
    forgetSeen();
    const open = await readProject(dir);
    const flow = JSON.parse(await text('flow.json'));
    flow.nodes.extra = 'code';
    await touch(join(dir, 'flow.json'), JSON.stringify(flow, null, 2));
    await mkdir(join(dir, 'nodes/extra'), { recursive: true });
    await writeFile(join(dir, 'nodes/extra/code.js'), 'function run() { return { out: "somebody else" }; }\n');
    await expect(writeProject(dir, open)).rejects.toThrow(/flow\.json/);
    expect(JSON.parse(await text('flow.json')).nodes.extra).toBe('code');
    expect(existsSync(join(dir, 'nodes/extra/code.js'))).toBe(true);
  });

  it('reports what changed on disk once, a deleted file as emptied, and what is taken in as no conflict for the next save', async () => {
    await writeProject(dir, sample());
    expect(await changesOnDisk(dir)).toEqual([]);

    await touch(join(dir, 'nodes/say/prompt.md'), 'You count carefully.\n');
    expect(await changesOnDisk(dir)).toEqual([{ node_id: 'say', field: 'prompt', value: 'You count carefully.' }]);
    expect(await changesOnDisk(dir)).toEqual([]);

    await rm(join(dir, 'nodes/count/output.js'));
    expect(await changesOnDisk(dir)).toEqual([{ node_id: 'count', field: 'output_definition', value: '' }]);

    // The page's blocks, edited in page.json.
    await touch(join(dir, 'page/page.json'), '[{ "id": "chart", "kind": "plot_window", "label": "Sales" }]\n');
    expect(await changesOnDisk(dir)).toEqual([{ node_id: null, field: 'blocks', value: [{ id: 'chart', kind: 'plot_window', label: 'Sales' }] }]);

    const graph = await readProject(dir);
    await expect(writeProject(dir, graph)).resolves.toBeUndefined();
  });
});

/**
 * A node that holds a graph holds a project folder: the same rules one level
 * down, and no second way of storing a graph.
 */
describe('a graph inside a node', () => {
  it('is a project folder of its own, read back whole, opened on its own, kept when the graph above is saved again, and reported as changed when a file in it is', async () => {
    const nested = parseGraph({
      metadata: { name: 'Outer' },
      nodes: [
        {
          id: 'part', node_type: 'subgraph', label: 'The hard part', position: { x: 10, y: 10 },
          inputs: [], outputs: [],
          description: 'Summarise a paper.',
          config: {
            subgraph: {
              metadata: { name: 'Inner' },
              nodes: [
                {
                  id: 'shorten', node_type: 'code', label: 'Shorten', position: { x: 5, y: 5 },
                  inputs: [port('text', 'input')], outputs: [port('short', 'output')],
                  config: { code: 'function run(i) { return { short: i.text.slice(0, 10) }; }' },
                },
              ],
              edges: [],
            },
          },
        },
      ],
      edges: [],
    });
    await writeProject(dir, nested);

    expect(JSON.parse(await text('nodes/part/flow.json')).name).toBe('Inner');
    expect(await text('nodes/part/nodes/shorten/code.js')).toContain('i.text.slice');
    // None of it is repeated in the node.json above.
    expect(JSON.parse(await text('nodes/part/node.json')).config).toEqual({});

    const inner = (await readProject(dir)).nodes[0].config.subgraph as Graph;
    expect(inner.nodes[0].config.code).toContain('i.text.slice');
    expect(inner.nodes[0].position).toEqual({ x: 5, y: 5 });
    expect(isProjectFolder(join(dir, 'nodes/part'))).toBe(true);
    expect((await loadGraph(join(dir, 'nodes/part'))).nodes.map((node) => node.id)).toEqual(['shorten']);

    // `tidy` must not walk into a folder that is somebody else's project: from up here, an inner code.js looks like a file nothing claims.
    await writeProject(dir, await readProject(dir));
    expect(existsSync(join(dir, 'nodes/part/nodes/shorten/code.js'))).toBe(true);

    expect(await changesOnDisk(dir)).toEqual([]);
    await touch(join(dir, 'nodes/part/nodes/shorten/code.js'), 'function run() { return { short: "hi" }; }\n');
    const [change, ...rest] = await changesOnDisk(dir);
    expect(rest).toEqual([]);
    expect(change).toMatchObject({ node_id: 'part', field: 'nested_graph' });
    expect((change.value as Graph).nodes[0].config.code).toContain('"hi"');
  });
});
