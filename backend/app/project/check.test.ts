import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseGraph, type Graph } from '../../../graph/graph.ts';
import { problemsIn } from './check.ts';
import { checkPath } from './folderCheck.ts';
import { forgetSeen, writeProject } from './folder.ts';

const port = (id: string, kind: 'input' | 'output') => ({ id, name: id, kind, data_type: 'any', multi: false, required: false, description: '' });

/** count hands "total" to say; *output* is count's output.js, *input* say's input.js. */
function graph(overrides: { output?: string; input?: string } = {}): Graph {
  return parseGraph({
    metadata: { name: 'Checked' },
    nodes: [
      {
        id: 'count', node_type: 'code', label: 'Count', description: 'Counts the rows.', inputs: [], outputs: [port('total', 'output')],
        config: { code: 'function run() { return { total: 1 }; }', ...(overrides.output !== undefined ? { output_definition: overrides.output } : {}) },
      },
      {
        id: 'say', node_type: 'ai', label: 'Say', description: 'Says the total in a sentence.', inputs: [port('total', 'input')], outputs: [port('output', 'output')],
        config: { prompt: 'Report the total.', ...(overrides.input !== undefined ? { input_definition: overrides.input } : {}) },
      },
      { id: 'show', node_type: 'end', label: 'Show', inputs: [port('value', 'input')], outputs: [], config: {} },
    ],
    edges: [
      { id: 'e1', source_node_id: 'count', source_port_id: 'total', target_node_id: 'say', target_port_id: 'total' },
      { id: 'e2', source_node_id: 'say', source_port_id: 'output', target_node_id: 'show', target_port_id: 'value' },
    ],
  });
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tell-and-wire-check-'));
  forgetSeen();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const where = (made: Graph) => problemsIn(made).map((p) => [p.where, p.problem]);
const said = (made: Graph) => problemsIn(made).map((p) => `${p.where}: ${p.problem}`).join(' ');

describe('what check finds', () => {
  it('in a node: nothing in a sound one, and a missing heading or text, a definition that names what is not there or cannot be read, no code', () => {
    expect(problemsIn(graph({ output: 'module.exports = { "total": 1 };', input: 'module.exports = { "total": 1 };' }))).toEqual([]);

    const made = graph();
    made.nodes[0].label = ' ';
    made.nodes[1].description = '';
    // An end point needs no text: it says nothing ✨ writes.
    made.nodes[2].description = '';
    expect(where(made)).toEqual([
      ['node "count"', 'It has no heading.'],
      ['node "say"', 'Its text is empty: nothing says what it should do, and what ✨ writes for it is written from that text.'],
    ]);

    expect(where(graph({ output: 'module.exports = { "sum": 1 };' }))).toEqual([
      ['node "count", output.js', 'It names "sum", which is not one of the node\'s outputs.'],
      ['node "count", output.js', 'It does not name the output "total", so nothing says what goes out there.'],
    ]);
    expect(where(graph({ input: 'module.exports = { "totl": 1 };' }))).toEqual([
      ['node "say", input.js', 'It names "totl", which is not one of the node\'s inputs.'],
    ]);
    const [unread] = problemsIn(graph({ output: "module.exports = { total: 'one' };" }));
    expect(unread.problem).toMatch(/^It cannot be read: its example after module.exports is not plain JSON/);
    expect(unread.fix).toMatch(/✨ Output/);

    const codeless = graph();
    codeless.nodes[0].config.code = '';
    expect(where(codeless)).toEqual([['node "count"', 'Its code.js holds no code yet: it fails the moment it runs.']]);
  });

  it('in the flow: a wire whose type cannot fit, a gate that can never open, end points sharing a label, no end point, and a block that fires nowhere', () => {
    const wired = (given: unknown, dataType: string, multi = false): Graph => {
      const made = graph({ output: `module.exports = ${JSON.stringify({ total: given })};` });
      Object.assign(made.nodes[1].inputs[0], { data_type: dataType, multi });
      return made;
    };
    expect(said(wired({ a: 1 }, 'number'))).toMatch(/edge "e1".*gives object, and the port takes number/);
    // Said nothing where one end has said nothing, and a list is judged by its items.
    expect(said(wired({ a: 1 }, 'any'))).toBe('');
    expect(said(wired([1], 'number', true))).toBe('');
    expect(said(wired(['one'], 'number', true))).toMatch(/gives string/);

    const gated = (dataType: string): Graph => {
      const made = graph();
      made.nodes[0].outputs[0].data_type = dataType as never;
      made.edges.push({ id: 'gate', source_node_id: 'count', source_port_id: 'total', target_node_id: 'show', target_port_id: '__run' });
      return made;
    };
    expect(said(gated('number'))).toMatch(/only the value true opens/);
    expect(said(gated('boolean'))).toBe('');

    const twins = graph();
    twins.nodes[2].label = 'Answer';
    twins.nodes.push({ ...twins.nodes[2], id: 'also', label: 'Answer' });
    twins.edges.push({ id: 'e3', source_node_id: 'say', source_port_id: 'output', target_node_id: 'also', target_port_id: 'value' });
    expect(problemsIn(twins)).toEqual([expect.objectContaining({
      where: 'nodes "show", "also"', fix: 'Give every end point its own label.',
    })]);

    const bare = graph();
    bare.nodes = bare.nodes.filter((node) => node.id !== 'show');
    bare.edges = bare.edges.filter((edge) => edge.target_node_id !== 'show');
    expect(problemsIn(bare)).toEqual([expect.objectContaining({ where: 'graph', problem: expect.stringMatching(/^Nothing a person can see: there is no end point/) })]);

    const paged = graph();
    paged.page = { blocks: [{ id: 'answer', kind: 'text_io', mode: 'output', label: 'Answer', shows: 'show' }] };
    expect(problemsIn(paged)).toEqual([]);
    paged.page.blocks.push({ id: 'go', kind: 'button', label: 'Go', fires: 'nowhere' });
    expect(where(paged)).toEqual([['the page, block "go"', 'It fires "nowhere", which is no start point of the graph: it starts (none).']]);
  });

  it('in a setting that would silently do nothing: once per item where no list is declared, a part nothing sends, a file written to no path, a part a call\'s example lacks', () => {
    /** A folder picker on the page, sent with the start point "chosen" into an ai node that is to summarise each file. */
    const folder = (story: Record<string, unknown>, config: Record<string, unknown>): Graph => parseGraph({
      metadata: { name: 'Folder' },
      nodes: [
        { id: 'chosen', node_type: 'start', label: 'Chosen', inputs: [], outputs: [], config: { started_by: 'page' } },
        { id: 'each', node_type: 'ai', description: 'Summarises one story.', inputs: [{ ...port('story', 'input'), field: 'folder', ...story }], outputs: [port('output', 'output')],
          config: { prompt: 'Summarise the story.', ...config } },
        { id: 'summaries', node_type: 'end', label: 'Summaries', inputs: [port('value', 'input')], outputs: [], config: {} },
      ],
      edges: [
        { id: 'a', source_node_id: 'chosen', source_port_id: 'data', target_node_id: 'each', target_port_id: 'story' },
        { id: 'b', source_node_id: 'each', source_port_id: 'output', target_node_id: 'summaries', target_port_id: 'value' },
      ],
      page: {
        blocks: [
          { id: 'folder', kind: 'input_picker', mode: 'directory', sends_to: ['chosen'], fires: 'chosen' },
          { id: 'shown', kind: 'text_io', mode: 'output', shows: 'summaries' },
        ],
      },
    });
    expect(said(folder({ data_type: 'file_path' }, { batch_mode: 'per_item' }))).toMatch(/none of its inputs is declared as a list/);
    expect(said(folder({ multi: true, data_type: 'file_path' }, { batch_mode: 'per_item' }))).toBe('');
    expect(said(folder({ field: 'fodler' }, {}))).toContain('It takes "fodler" of what "chosen" is sent, and no block of the page sends "fodler" to it: it is sent "folder".');

    /** An end point set to write to a file at *path*. */
    const writing = (path: string): Graph => parseGraph({
      metadata: { name: 'Writes' },
      nodes: [
        { id: 'made', node_type: 'data', label: 'Made', description: 'What is written.', inputs: [], outputs: [port('output', 'output')], config: { data_value: 'x' } },
        { id: 'saved', node_type: 'end', label: 'Saved', inputs: [port('value', 'input'), port('path', 'input')], outputs: [], config: { write_mode: 'file', path } },
      ],
      edges: [{ id: 'v', source_node_id: 'made', source_port_id: 'output', target_node_id: 'saved', target_port_id: 'value' }],
    });
    expect(where(writing(''))).toEqual([['node "saved"', 'It writes to a file, and names none: nothing is written.']]);
    expect(problemsIn(writing('out/result.txt'))).toEqual([]);

    /** A start point a call starts, sent *example* when nobody sends it anything, and a node whose input takes *field* of it. */
    const called = (example: Record<string, unknown>, field: string): Graph => parseGraph({
      metadata: { name: 'Called' },
      nodes: [
        { id: 'ask', node_type: 'start', label: 'Ask', config: { started_by: 'call', values: example } },
        { id: 'say', node_type: 'end', label: 'Said', inputs: [{ ...port('value', 'input'), field }], outputs: [], config: {} },
      ],
      edges: [{ id: 'e', source_node_id: 'ask', source_port_id: 'data', target_node_id: 'say', target_port_id: 'value' }],
    });
    const [problem] = problemsIn(called({ topic: 'cats' }, 'subject'));
    expect(problem.where).toBe('node "say", input "value"');
    expect(problem.fix).toBe('Add "subject" to what "ask" is sent for example, or take one of what it holds: "topic".');
    expect(problemsIn(called({ file: { content: 'x' } }, 'file.content'))).toEqual([]);
  });

  it('in a project folder: a folder no node owns, a file nothing reads, and a project that cannot be read', async () => {
    await writeProject(dir, graph());
    await mkdir(join(dir, 'nodes', 'old_step'));
    await writeFile(join(dir, 'nodes', 'old_step', 'code.js'), '');
    await writeFile(join(dir, 'nodes', 'say', 'instructions.md'), 'Written, never sent.');
    const { problems } = await checkPath(dir);
    expect(problems.map((p) => [p.where, p.problem])).toEqual([
      ['nodes/old_step', 'This folder belongs to no node in flow.json.'],
      ['nodes/say/instructions.md', 'Nothing reads this file.'],
    ]);
    expect(problems[1].fix).toMatch(/"prompt.md"/);

    await writeFile(join(dir, 'flow.json'), '{ broken');
    const broken = await checkPath(dir);
    expect(broken.graph).toBeNull();
    expect(broken.problems[0].problem).toMatch(/not valid JSON/);
  });

  /**
   * A graph inside a node is checked by the same function that checks the one
   * above it, so everything it can get wrong is already covered. What is here
   * is the boundary between the two, and what only makes sense in there.
   */
  it('in a graph inside a node: what is wrong in there, saying which node it is in, and what is right is quiet', async () => {
    const holder = (inner: unknown, description = '') => parseGraph({
      metadata: { name: 'Outer' },
      nodes: [
        { id: 'part', node_type: 'subgraph', label: 'Part', description, inputs: [], outputs: [], config: { subgraph: inner } },
        { id: 'show', node_type: 'end', label: 'Show', inputs: [port('value', 'input')], outputs: [], config: {} },
      ],
      edges: [],
    });
    const inner = (nodes: unknown[], edges: unknown[] = [], blocks: unknown[] = []) => ({ metadata: { name: 'Inner' }, nodes, edges, page: { blocks } });
    const end = { id: 'out', node_type: 'end', label: 'Out', inputs: [port('value', 'input')], outputs: [], config: {} };

    expect(said(holder(inner([
      { id: 'broken', node_type: 'code', label: 'Broken', inputs: [], outputs: [port('out', 'output')], config: { code: '' } },
      end,
    ])))).toContain('node "part" ▸ node "broken": Its code.js holds no code yet');
    // A page belongs to the graph at the top.
    expect(said(holder(inner([
      { id: 'press', node_type: 'start', label: 'Press', inputs: [], outputs: [], config: { started_by: 'page' } }, end,
    ], [{ id: 'p', source_node_id: 'press', source_port_id: 'data', target_node_id: 'out', target_port_id: 'value' }],
    [{ id: 'shown', kind: 'text_io', mode: 'output', shows: 'out' }])))).toContain('a page in here would never be shown');
    expect(said(holder(inner([]), 'Summarise the paper.'))).toContain('described and empty');
    expect(said(holder('not a graph'))).toContain('cannot be read');

    const good = holder(inner([
      { id: 'text', node_type: 'start', label: 'Text', inputs: [], outputs: [], config: { started_by: 'call', values: { text: 'hi' } } },
      { id: 'out', node_type: 'end', label: 'Short', inputs: [{ ...port('value', 'input'), field: 'text' }], outputs: [], config: {} },
    ], [{ id: 'i1', source_node_id: 'text', source_port_id: 'data', target_node_id: 'out', target_port_id: 'value' }]));
    expect(problemsIn(good)).toEqual([]);
    // And on disk, where its folder is a project folder of its own.
    await writeProject(dir, good);
    expect((await checkPath(dir)).problems).toEqual([]);
  });
});
