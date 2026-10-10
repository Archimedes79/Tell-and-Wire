import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseGraph, withoutDefaults, type Graph } from '../../../graph/graph.ts';
import { problemsIn } from './check.ts';
import { folderName } from './names.ts';
import { RUN_ON_ITS_OWN } from '../../../graph/nodes/code/CodeNodeRunner.ts';
import { registry } from '../../../graph/nodes/registry.ts';
import {
  FileChanged, changesOnDisk, forgetSeen, graphAt, isProjectFolder, loadGraph, readProject, saveGraph, writeProject,
} from './folder.ts';

const port = (id: string, kind: 'input' | 'output') => ({ id, name: id, kind, data_type: 'any', multi: false, required: false, description: '' });

/** A code node and an ai node, which keep writing, beside a start point that reads a folder and an end point, which keep none -- and a page with a chart. */
function sample(): Graph {
  return parseGraph({
    metadata: { name: 'Sample', description: 'All the writing there is.' },
    nodes: [
      {
        id: 'pick', node_type: 'start', label: 'Pick', position: { x: 10, y: 20 },
        inputs: [], outputs: [port('data', 'output')],
        config: { started_by: 'itself', reads: 'folder', path: 'data', extensions: '.csv' },
      },
      {
        id: 'count', node_type: 'code', label: 'Count', position: { x: 300.4, y: 20 }, width: 360, height: 180,
        inputs: [port('files', 'input')], outputs: [port('total', 'output')],
        config: {
          code: 'function run(inputs) {\n  return { total: inputs.files.length };\n}',
          input_definition: 'module.exports = { "files": ["a.csv"] };',
          output_definition: 'module.exports = { "total": 1 };',
          history: '## 2026-09-28 09:05 · ✨ Code\n\nNothing was sent.',
          batch_mode: 'per_item', catch_errors: false,
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
      { id: 'e1', source_node_id: 'pick', source_port_id: 'data', target_node_id: 'count', target_port_id: 'files' },
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
  it('keeps each piece of writing in a file named for what it is, the wires once in flow.json, each node once in nodes.json, and a data node\'s fields as JSON in data.json', async () => {
    await writeProject(dir, sample());
    expect(await text('nodes/count/code.js')).toBe(`function run(inputs) {\n  return { total: inputs.files.length };\n}\n\n${RUN_ON_ITS_OWN}\n`);
    expect(await text('nodes/count/input.js')).toBe('module.exports = { "files": ["a.csv"] };\n');
    expect(await text('nodes/count/output.js')).toBe('module.exports = { "total": 1 };\n');
    expect(await text('nodes/count/history.md')).toBe('## 2026-09-28 09:05 · ✨ Code\n\nNothing was sent.\n');
    expect(await text('nodes/say/prompt.md')).toBe('Say how many files there are, in one sentence.\n');
    // code.js runs on its own, on the example in input.js.
    const { stdout } = await promisify(execFile)(process.execPath, [join(dir, 'nodes/count/code.js')], { cwd: dir });
    expect(JSON.parse(stdout)).toEqual({ total: 1 });
    // A start point has no writing of its own, and a chart is one block of the page's: no node, no folder.
    expect(existsSync(join(dir, 'nodes/pick'))).toBe(false);
    expect(existsSync(join(dir, 'nodes/told'))).toBe(false);
    expect(JSON.parse(await text('page.json'))).toEqual([{ id: 'chart', kind: 'plot_window', label: 'Chart', shows: 'told' }]);
    expect(existsSync(join(dir, 'nodes/page'))).toBe(false);

    // The flow says no more than who is wired to whom; what a node is, is the list's.
    expect(JSON.parse(await text('flow.json'))).toEqual({
      name: 'Sample',
      description: 'All the writing there is.',
      wires: ['pick.data -> count.files', 'count.total -> say.total', 'say.output -> told.value'],
    });
    const listed = JSON.parse(await text('nodes.json'));
    expect(Object.keys(listed)).toEqual(['pick', 'count', 'say', 'told']);
    // What follows from a start point's settings is not written; what a person set is, and only that: catch_errors, at its default, is not.
    expect(listed.pick).toEqual({ kind: 'start', label: 'Pick', config: { extensions: '.csv', path: 'data', reads: 'folder', started_by: 'itself' } });
    expect(listed.count).toEqual({
      kind: 'code', label: 'Count', config: { batch_mode: 'per_item' },
      inputs: [{ port: 'files', type: 'any' }], outputs: [{ port: 'total', type: 'any' }],
    });
    expect(JSON.stringify(listed.count)).not.toContain('pick');
    expect(existsSync(join(dir, 'nodes/count/node.json'))).toBe(false);
    expect(JSON.parse(await text('layout.json')).count).toEqual({ x: 300, y: 20, width: 360, height: 180 });

    const data = (id: string, fields: Record<string, unknown>, inputs: unknown[] = []) => ({ id, node_type: 'data', label: id, inputs, outputs: [], config: { data_value: fields } });
    const held = join(dir, 'held');
    await writeProject(held, parseGraph({
      metadata: { name: 'Held' },
      nodes: [data('count', { count: 2, names: ['Ada'] }, [{ ...port('count', 'input'), field: 'chat.message' }]), data('note', { text: 'Line one.\nLine two.' })],
      edges: [],
    }));
    // A data node's fields are one file, data.json, whatever they hold; its ports follow them.
    expect(JSON.parse(await readFile(join(held, 'nodes/count/data.json'), 'utf8'))).toEqual({ count: 2, names: ['Ada'] });
    expect(JSON.parse(await readFile(join(held, 'nodes/note/data.json'), 'utf8'))).toEqual({ text: 'Line one.\nLine two.' });
    // Its ports are not in nodes.json, but for what a person chose of an input: which part of a package it takes ...
    const heldList = JSON.parse(await readFile(join(held, 'nodes.json'), 'utf8'));
    expect(heldList.note).toEqual({ kind: 'data', label: 'note' });
    expect(heldList.count.inputs).toEqual([{ port: 'count', field: 'chat.message' }]);
    expect(heldList.count.outputs).toBeUndefined();
    // How it looks filled is a file of its own, a stub until something is written there; one that is comes back.
    expect(JSON.parse(await readFile(join(held, 'nodes/note/example.json'), 'utf8'))).toEqual({});
    forgetSeen();
    const again = await readProject(held);
    expect(again.nodes.map((node) => node.config.data_value)).toEqual([{ count: 2, names: ['Ada'] }, { text: 'Line one.\nLine two.' }]);
    // ... they follow the fields again when it is read, with that choice kept.
    expect(again.nodes[1].outputs.map((one) => one.id)).toEqual(['text', 'round', 'all', 'before']);
    expect(again.nodes[0].inputs.map((one) => [one.id, one.data_type, one.field])).toEqual([['count', 'any', 'chat.message'], ['names', 'any', undefined]]);
  });

  it('reads back exactly what was written', async () => {
    const original = sample();
    await writeProject(dir, original);
    const read = await readProject(dir);
    original.nodes[1].position.x = 300; // stored rounded
    // A node whose ports follow from its settings has them as they follow; a setting at its default is not written, and reads back as missing.
    for (const node of original.nodes) {
      Object.assign(node, registry.node(node.node_type)?.derivedPorts(node, registry) ?? {});
      node.config = withoutDefaults(node.config);
    }
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
    const files = ['flow.json', 'nodes.json', 'layout.json', 'page.json'];
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

    // Names Windows keeps and a trailing dot it drops are no folders as they stand; what they become may meet another id.
    expect(['con', 'NUL.x', 'com1', 'x.', 'x '].map(folderName)).toEqual(['_con', '_NUL.x', '_com1', 'x_', 'x_']);
    const dots = parseGraph({ metadata: { name: 'Dots' }, nodes: [code('x.', 'a'), code('x_', 'b')], edges: [] });
    expect(problemsIn(dots).some((p) => /share a folder/.test(p.problem))).toBe(true);

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

  it('reads a node list that says only the kinds, and refuses a project with no list, or a node with no kind, or a wire to a node the list lacks', async () => {
    await writeFile(join(dir, 'flow.json'), JSON.stringify({ wires: ['work.out -> result.value'] }));
    await expect(readProject(dir)).rejects.toThrow(/No list of nodes at .*nodes\.json/);

    await writeFile(join(dir, 'nodes.json'), JSON.stringify({ work: {}, result: { kind: 'end' } }));
    await expect(readProject(dir)).rejects.toThrow(/node "work" needs a "kind"/);

    await writeFile(join(dir, 'nodes.json'), JSON.stringify({ work: { kind: 'code' }, result: { kind: 'end' } }));
    const graph = await readProject(dir);
    expect(graph.nodes.map((node) => [node.id, node.node_type, node.label])).toEqual([['work', 'code', 'work'], ['result', 'end', 'result']]);

    // Said by `check`, not made up for: the wire stays as written.
    await writeFile(join(dir, 'flow.json'), JSON.stringify({ wires: ['work.out -> missing.value'] }));
    expect(problemsIn(await readProject(dir)).some((problem) => /there is no such node/.test(problem.problem))).toBe(true);
  });

  it('refuses to read a page file that is no list of blocks as "no page", which a save would delete, and to save over a .json file that holds no graph', async () => {
    await writeProject(dir, sample());
    for (const wrong of ['{"blocks": []}', '{}', 'null', '[1]']) {
      await writeFile(join(dir, 'page.json'), wrong);
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
    const listed = JSON.parse(await text('nodes.json'));
    listed.extra = { kind: 'code' };
    await touch(join(dir, 'nodes.json'), JSON.stringify(listed, null, 2));
    await mkdir(join(dir, 'nodes/extra'), { recursive: true });
    await writeFile(join(dir, 'nodes/extra/code.js'), 'function run() { return { out: "somebody else" }; }\n');
    await expect(writeProject(dir, open)).rejects.toThrow(/nodes\.json/);
    expect(JSON.parse(await text('nodes.json')).extra).toEqual({ kind: 'code' });
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
    await touch(join(dir, 'page.json'), '[{ "id": "chart", "kind": "plot_window", "label": "Sales" }]\n');
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
    // None of it is repeated in the list above.
    expect(JSON.parse(await text('nodes.json')).part.config).toBeUndefined();
    expect(JSON.parse(await text('nodes/part/nodes.json')).shorten.kind).toBe('code');

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
