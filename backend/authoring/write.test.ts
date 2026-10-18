import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseGraph, withoutDefaults, type Graph } from '../../graph/graph.ts';
import { problemsIn } from '../../gui/authoring/check.ts';
import { folderName } from '../../graph/files/names.ts';
import { RUN_ON_ITS_OWN } from '../../graph/nodes/code/CodeNodeDefinition.ts';
import { registry } from '../../graph/nodes/registry.ts';
import { FileChanged, forgetSeen, isProjectFolder, loadGraph, readProject } from '../deployment/project/folder.ts';
import { changesOnDisk, graphAt, saveGraph, writeProject } from './write.ts';

const port = (id: string, kind: 'input' | 'output') => ({ id, name: id, kind, data_type: 'any', multi: false, required: false, description: '' });

/** A code node and an ai node, which keep writing, beside a start point that reads a folder and an end point, which keep none -- and a GUI with a chart. */
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
      { id: 'e2', source_node_id: 'count', source_port_id: 'total', target_node_id: 'say', target_port_id: 'total', via: ['B2'] },
      { id: 'e3', source_node_id: 'say', source_port_id: 'output', target_node_id: 'told', target_port_id: 'value' },
    ],
    gui: { blocks: [{ id: 'chart', kind: 'plot_window', label: 'Chart', shows: 'told' }] },
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
  it('keeps each piece of writing in a file named for what it is, the wires once in graph-flow.json, each node once in graph-nodes.json, and a data node\'s fields as JSON in data.json', async () => {
    await writeProject(dir, sample());
    expect(await text('nodes/count/code.js')).toBe(`function run(inputs) {\n  return { total: inputs.files.length };\n}\n\n${RUN_ON_ITS_OWN}\n`);
    expect(await text('nodes/count/input.js')).toBe('module.exports = { "files": ["a.csv"] };\n');
    expect(await text('nodes/count/output.js')).toBe('module.exports = { "total": 1 };\n');
    expect(await text('nodes/count/history.md')).toBe('## 2026-09-28 09:05 · ✨ Code\n\nNothing was sent.\n');
    expect(await text('nodes/say/prompt.md')).toBe('Say how many files there are, in one sentence.\n');
    // code.js runs on its own, on the example in input.js.
    const { stdout } = await promisify(execFile)(process.execPath, [join(dir, 'nodes/count/code.js')], { cwd: dir });
    expect(JSON.parse(stdout)).toEqual({ total: 1 });
    // A start point has no writing of its own, and a chart is one block of the GUI's: no node, no folder.
    expect(existsSync(join(dir, 'nodes/pick'))).toBe(false);
    expect(existsSync(join(dir, 'nodes/told'))).toBe(false);
    expect(JSON.parse(await text('gui.json'))).toEqual([{ id: 'chart', kind: 'plot_window', label: 'Chart', shows: 'told' }]);

    // The flow says no more than who is wired to whom, and through which cell a wire is drawn; what a node is, is the list's.
    expect(JSON.parse(await text('graph-flow.json'))).toEqual({
      name: 'Sample',
      description: 'All the writing there is.',
      wires: ['pick.data -> count.files', 'count.total -> say.total via B2', 'say.output -> told.value'],
    });
    const listed = JSON.parse(await text('graph-nodes.json'));
    expect(Object.keys(listed)).toEqual(['pick', 'count', 'say', 'told']);
    // What follows from a start point's settings is not written; what a person set is, and only that: catch_errors, at its default, is not.
    expect(listed.pick).toEqual({ kind: 'start', label: 'Pick', config: { extensions: '.csv', path: 'data', reads: 'folder', started_by: 'itself' } });
    expect(listed.count).toEqual({
      kind: 'code', label: 'Count', config: { batch_mode: 'per_item' },
      inputs: [{ port: 'files', type: 'any' }], outputs: [{ port: 'total', type: 'any' }],
    });
    expect(JSON.stringify(listed.count)).not.toContain('pick');
    expect(existsSync(join(dir, 'nodes/count/node.json'))).toBe(false);
    expect(JSON.parse(await text('graph-schedule.json'))).toEqual({ table: ['pick count say told'], size: { count: { width: 360, height: 180 } } });

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
    // Its ports are not in graph-nodes.json, but for what a person chose of an input: which part of a package it takes ...
    const heldList = JSON.parse(await readFile(join(held, 'graph-nodes.json'), 'utf8'));
    expect(heldList.note).toEqual({ kind: 'data', label: 'note' });
    expect(heldList.count.inputs).toEqual([{ port: 'count', field: 'chat.message' }]);
    expect(heldList.count.outputs).toBeUndefined();
    // How it looks filled is a file of its own, a stub until something is written there; one that is comes back.
    expect(JSON.parse(await readFile(join(held, 'nodes/note/example.json'), 'utf8'))).toEqual({});
    forgetSeen();
    const again = await readProject(held);
    expect(again.nodes.map((node) => node.config.data_value)).toEqual([{ count: 2, names: ['Ada'] }, { text: 'Line one.\nLine two.' }]);
    // ... they follow the fields again when it is read, with that choice kept.
    expect(again.nodes[1].outputs.map((one) => one.id)).toEqual(['text']);
    expect(again.nodes[0].inputs.map((one) => [one.id, one.data_type, one.field])).toEqual([['count', 'any', 'chat.message'], ['names', 'any', undefined]]);
  });

  it('reads back exactly what was written', async () => {
    const original = sample();
    await writeProject(dir, original);
    const read = await readProject(dir);
    for (const node of original.nodes) node.position = { x: 0, y: 0 }; // where a card is drawn follows from the schedule: not stored
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
    expect(read.gui).toEqual(original.gui);
    expect(read.schedule).toEqual(['pick count say told']);
  });

  it('writes the same bytes for the same graph, so an unchanged save is no change', async () => {
    await writeProject(dir, sample());
    const files = ['graph-flow.json', 'graph-nodes.json', 'graph-schedule.json', 'gui.json'];
    const first = await Promise.all(files.map(text));
    await writeProject(dir, await readProject(dir));
    expect(await Promise.all(files.map(text))).toEqual(first);
  });

  it('takes a footer off that an older version worded otherwise, and writes the one there is, once', async () => {
    await writeProject(dir, sample());
    const body = 'function run(inputs) {\n  return { total: inputs.files.length };\n}';
    // the footer as an earlier version wrote it: another dash count, one line less, and code a person added after it
    const older = RUN_ON_ITS_OWN.replace(/─+/, '───────').replace('const node = { windows: [], llm', 'const node = { llm').replace(' and this part is left out.', '.');
    expect(older).not.toBe(RUN_ON_ITS_OWN);
    await touch(join(dir, 'nodes/count/code.js'), `${body}\n\n${older}\n\nfunction helper() {\n  return 1;\n}\n`);
    forgetSeen();
    const held = (await readProject(dir)).nodes.find((node) => node.id === 'count')?.config.code;
    expect(held).toBe(`${body}\n\nfunction helper() {\n  return 1;\n}`);
    // a save writes what there is of it once, and what was written twice by an earlier save is taken off as well
    await touch(join(dir, 'nodes/count/code.js'), `${body}\n\n${RUN_ON_ITS_OWN}\n\n${older}\n`);
    forgetSeen();
    expect((await readProject(dir)).nodes.find((node) => node.id === 'count')?.config.code).toBe(body);
    await writeProject(dir, await readProject(dir));
    expect(await text('nodes/count/code.js')).toBe(`${body}\n\n${RUN_ON_ITS_OWN}\n`);
  });

  it('carries the footer of the day in every code.js of the examples, so opening one shows the node its code and nothing else', async () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const codeFiles = async (folder: string): Promise<string[]> => {
      const found: string[] = [];
      for (const entry of await readdir(folder, { withFileTypes: true })) {
        if (entry.isDirectory()) found.push(...await codeFiles(join(folder, entry.name)));
        else if (entry.name === 'code.js') found.push(join(folder, entry.name));
      }
      return found;
    };
    const files = [...await codeFiles(join(root, 'examples')), ...await codeFiles(join(root, 'notebook-examples'))];
    expect(files.length).toBeGreaterThan(5);
    const wrong: string[] = [];
    for (const file of files) {
      if ((await readFile(file, 'utf8')).replace(/\r\n/g, '\n').split(RUN_ON_ITS_OWN).length !== 2) wrong.push(file);
    }
    expect(wrong).toEqual([]);
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
    expect(existsSync(join(dir, 'graph-flow.json'))).toBe(false);
  });

  it('reads a node list that says only the kinds, and refuses a project with no list, or a node with no kind, or a wire to a node the list lacks', async () => {
    await writeFile(join(dir, 'graph-flow.json'), JSON.stringify({ wires: ['work.out -> result.value'] }));
    await expect(readProject(dir)).rejects.toThrow(/No list of nodes at .*nodes\.json/);

    await writeFile(join(dir, 'graph-nodes.json'), JSON.stringify({ work: {}, result: { kind: 'end' } }));
    await expect(readProject(dir)).rejects.toThrow(/node "work" needs a "kind"/);

    await writeFile(join(dir, 'graph-nodes.json'), JSON.stringify({ work: { kind: 'code' }, result: { kind: 'end' } }));
    const graph = await readProject(dir);
    expect(graph.nodes.map((node) => [node.id, node.node_type, node.label])).toEqual([['work', 'code', 'work'], ['result', 'end', 'result']]);

    // Said by `check`, not made up for: the wire stays as written.
    await writeFile(join(dir, 'graph-flow.json'), JSON.stringify({ wires: ['work.out -> missing.value'] }));
    expect(problemsIn(await readProject(dir)).some((problem) => /there is no such node/.test(problem.problem))).toBe(true);
  });

  it('refuses to read a GUI file that is no list of blocks as "no GUI", which a save would delete, and to save over a .json file that holds no graph', async () => {
    await writeProject(dir, sample());
    for (const wrong of ['{"blocks": []}', '{}', 'null', '[1]']) {
      await writeFile(join(dir, 'gui.json'), wrong);
      await expect(readProject(dir), wrong).rejects.toThrow(/must be a list of blocks/);
    }

    const other = join(dir, 'package.json');
    await writeFile(other, '{"name": "not a graph"}');
    expect(graphAt(other)).toBeNull();
    await expect(saveGraph(other, sample())).rejects.toThrow(/holds no graph/);
    expect(await text('package.json')).toBe('{"name": "not a graph"}');
  });

  it('does not save under "." or "..": those are folders, and the tool would land in the one it was meant to go into, or above', async () => {
    // In a folder of its own, so that a name that got through would write into the test's folder and not above it.
    const work = join(dir, 'work');
    await mkdir(work);
    for (const dots of [`${work}/..`, `${work}/.`, `${work}\\..\\`, `${work}/../`]) {
      await expect(saveGraph(dots, sample()), dots).rejects.toThrow(/is a folder, not a name/);
    }
    expect(existsSync(join(dir, 'graph-flow.json'))).toBe(false);
    expect(existsSync(join(work, 'graph-flow.json'))).toBe(false);
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
    const listed = JSON.parse(await text('graph-nodes.json'));
    listed.extra = { kind: 'code' };
    await touch(join(dir, 'graph-nodes.json'), JSON.stringify(listed, null, 2));
    await mkdir(join(dir, 'nodes/extra'), { recursive: true });
    await writeFile(join(dir, 'nodes/extra/code.js'), 'function run() { return { out: "somebody else" }; }\n');
    await expect(writeProject(dir, open)).rejects.toThrow(/nodes\.json/);
    expect(JSON.parse(await text('graph-nodes.json')).extra).toEqual({ kind: 'code' });
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

    // The GUI's blocks, edited in gui.json.
    await touch(join(dir, 'gui.json'), '[{ "id": "chart", "kind": "plot_window", "label": "Sales" }]\n');
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

    expect(JSON.parse(await text('nodes/part/graph-flow.json')).name).toBe('Inner');
    expect(await text('nodes/part/nodes/shorten/code.js')).toContain('i.text.slice');
    // None of it is repeated in the list above.
    expect(JSON.parse(await text('graph-nodes.json')).part.config).toBeUndefined();
    expect(JSON.parse(await text('nodes/part/graph-nodes.json')).shorten.kind).toBe('code');

    const inner = (await readProject(dir)).nodes[0].config.subgraph as Graph;
    expect(inner.nodes[0].config.code).toContain('i.text.slice');
    expect(inner.schedule).toEqual(['shorten']);
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

  // Where the disk does not tell cases apart a folder is the node's whatever its spelling: Save must not take it for a stray one.
  it.skipIf(process.platform !== 'win32')('keeps the files of a node whose folder is spelled in other letters than its id', async () => {
    await writeProject(dir, sample());
    await rename(join(dir, 'nodes/count'), join(dir, 'nodes/spelled'));
    await rename(join(dir, 'nodes/spelled'), join(dir, 'nodes/Count'));
    await writeProject(dir, await readProject(dir));
    expect(existsSync(join(dir, 'nodes/count/code.js'))).toBe(true);
  });
});

describe('files beside a code node\'s code.js', () => {
  it('come into the node when its folder is read, go to its folder when it is saved, leave with the node\'s setting, and are no file when emptied', async () => {
    const graph = sample();
    await writeProject(dir, graph);
    await writeFile(join(dir, 'nodes/count/tax.js'), 'module.exports = {};\n');
    await writeFile(join(dir, 'nodes/count/rates.json'), '{ "a": 1 }\n');
    await writeFile(join(dir, 'nodes/count/notes.md'), 'mine, and not a file a body loads');
    forgetSeen();

    const read = await readProject(dir);
    const count = read.nodes.find((node) => node.id === 'count')!;
    expect(count.config['file:tax.js']).toBe('module.exports = {};');
    expect(count.config['file:rates.json']).toBe('{ "a": 1 }');
    expect(Object.keys(count.config).some((key) => key.includes('notes'))).toBe(false);

    // Saved, they are files again and not settings in graph-nodes.json.
    count.config['file:more.js'] = 'module.exports = 1;';
    await writeProject(dir, read);
    expect(await text('nodes/count/more.js')).toBe('module.exports = 1;\n');
    expect(await text('graph-nodes.json')).not.toMatch(/file:|tax\.js/);

    // Taken out of the node, a file goes; one that is left empty is no file; a file of the person's, however named, stays.
    const again = await readProject(dir);
    const node = again.nodes.find((candidate) => candidate.id === 'count')!;
    delete node.config['file:rates.json'];
    node.config['file:tax.js'] = '';
    await writeProject(dir, again);
    expect(existsSync(join(dir, 'nodes/count/rates.json'))).toBe(false);
    expect(existsSync(join(dir, 'nodes/count/tax.js'))).toBe(false);
    expect(existsSync(join(dir, 'nodes/count/more.js'))).toBe(true);
    expect(await text('nodes/count/notes.md')).toBe('mine, and not a file a body loads');
  });

  it('are not kept by a node that is not a code node, and are named by no code node but the one whose folder holds them', async () => {
    const graph = sample();
    const say = graph.nodes.find((node) => node.id === 'say')!;
    await writeProject(dir, graph);
    await writeFile(join(dir, 'nodes/say/tax.js'), '// not an ai node\'s');
    const read = await readProject(dir);
    expect(Object.keys(read.nodes.find((node) => node.id === 'say')!.config).filter((key) => key.startsWith('file:'))).toEqual([]);
    expect(say.node_type).toBe('ai');
  });
});
