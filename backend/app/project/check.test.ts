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
  dir = await mkdtemp(join(tmpdir(), 'ai-graph-check-'));
  forgetSeen();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('what check finds in a graph', () => {
  it('finds nothing in a sound one', () => {
    expect(problemsIn(graph({ output: 'module.exports = { "total": 1 };', input: 'module.exports = { "total": 1 };' }))).toEqual([]);
  });

  it('finds a node without a heading, and a node ✨ writes for without a text', () => {
    const made = graph();
    made.nodes[0].label = ' ';
    made.nodes[1].description = '';
    // An end point needs no text: it says nothing ✨ writes.
    made.nodes[2].description = '';
    expect(problemsIn(made).map((p) => [p.where, p.problem])).toEqual([
      ['node "count"', 'It has no heading.'],
      ['node "say"', 'Its text is empty: nothing says what it should do, and what ✨ writes for it is written from that text.'],
    ]);
  });

  it('finds an output.js whose keys are not the outputs: one it names that is none, one it leaves out', () => {
    expect(problemsIn(graph({ output: 'module.exports = { "sum": 1 };' })).map((p) => [p.where, p.problem])).toEqual([
      ['node "count", output.js', 'It names "sum", which is not one of the node\'s outputs.'],
      ['node "count", output.js', 'It does not name the output "total", so nothing says what goes out there.'],
    ]);
  });

  it('finds an input.js naming an input the node does not have', () => {
    expect(problemsIn(graph({ input: 'module.exports = { "totl": 1 };' }))).toEqual([expect.objectContaining({
      where: 'node "say", input.js', problem: 'It names "totl", which is not one of the node\'s inputs.',
    })]);
  });

  it('finds a definition whose example cannot be read', () => {
    const [problem] = problemsIn(graph({ output: "module.exports = { total: 'one' };" }));
    expect(problem.problem).toMatch(/^It cannot be read: its example after module.exports is not plain JSON/);
    expect(problem.fix).toMatch(/✨ Output/);
  });

  it('finds a code node with no code, said as a person meets it: its code.js', () => {
    const made = graph();
    made.nodes[0].config.code = '';
    expect(problemsIn(made)).toEqual([{
      where: 'node "count"',
      problem: 'Its code.js holds no code yet: it fails the moment it runs.',
      fix: 'Write it with ✨ Code, or write function run(inputs) { … } in code.js (config.code in a graph file), returning an object keyed by its outputs.',
    }]);
  });

  it('finds two end points under one label, with the keys the run really uses', () => {
    const made = graph();
    made.nodes[2].label = 'Answer';
    made.nodes.push(
      { ...made.nodes[2], id: 'clash', label: 'Answer (also)' },
      { ...made.nodes[2], id: 'also', label: 'Answer' },
    );
    made.edges.push(
      { id: 'e3', source_node_id: 'say', source_port_id: 'output', target_node_id: 'also', target_port_id: 'value' },
      { id: 'e4', source_node_id: 'say', source_port_id: 'output', target_node_id: 'clash', target_port_id: 'value' },
    );
    expect(problemsIn(made)).toEqual([expect.objectContaining({
      where: 'nodes "show", "also"',
      problem: 'These end points share the label "Answer", so the run\'s result keeps only the first under it, the rest under "Answer (also) 2".',
      fix: 'Give every end point its own label.',
    })]);
  });

  it('finds nothing a person can see where there is no end point: a block shows one, a script reads one', () => {
    const made = graph();
    made.nodes = made.nodes.filter((node) => node.id !== 'show');
    made.edges = made.edges.filter((edge) => edge.target_node_id !== 'show');
    expect(problemsIn(made)).toEqual([expect.objectContaining({
      where: 'graph',
      problem: 'Nothing a person can see: there is no end point, so a run computes its answer and shows nobody.',
    })]);
    // A block that would show one does not make one.
    made.page = { blocks: [{ id: 'answer', kind: 'text_io', mode: 'output', label: 'Answer', shows: 'show' }] };
    expect(problemsIn(made).map((found) => found.problem)).toEqual([
      'Nothing a person can see: there is no end point, so a run computes its answer and shows nobody.',
      'It shows "show", which is no end point of the graph: it ends at (none).',
    ]);
  });

  it('says what is wrong with the page beside what is wrong with the graph, as the page names it', () => {
    const made = graph();
    made.page = { blocks: [{ id: 'answer', kind: 'text_io', mode: 'output', label: 'Answer', shows: 'show' }] };
    expect(problemsIn(made)).toEqual([]);
    made.page.blocks.push({ id: 'go', kind: 'button', label: 'Go', fires: 'nowhere' });
    expect(problemsIn(made)).toEqual([expect.objectContaining({
      where: 'the page, block "go"',
      problem: 'It fires "nowhere", which is no start point of the graph: it starts (none).',
    })]);
  });
});

describe('what check finds in a setting that would silently do nothing', () => {
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
  const said = (graph: Graph) => problemsIn(graph).map((found) => found.problem).join(' ');

  it('finds "once per item" where a list arrives and no input is declared as one: it would run once, on all of it', () => {
    expect(said(folder({ data_type: 'file_path' }, { batch_mode: 'per_item' }))).toMatch(/none of its inputs is declared as a list/);
    expect(said(folder({ multi: true, data_type: 'file_path' }, { batch_mode: 'per_item' }))).toBe('');
    // Not where no list arrives: a file the picker sends, or a part of what it sends.
    expect(said(folder({ data_type: 'file_path' }, { batch_mode: 'whole_list' }))).toBe('');
    const file = folder({ data_type: 'file_path' }, { batch_mode: 'per_item' });
    file.page!.blocks[0].mode = 'file';
    expect(said(file)).toBe('');
    expect(problemsIn(graph())).toEqual([]);
  });

  it('finds a value a node takes of what the page sends that no block sends: it would never arrive', () => {
    expect(said(folder({ field: 'fodler' }, {}))).toBe('It takes "fodler" of what "chosen" is sent, and no block of the page sends "fodler" to it: it is sent "folder".');
  });
});

describe('what check finds on a gate', () => {
  const gated = (dataType: string): Graph => {
    const made = graph();
    made.nodes[0].outputs[0].data_type = dataType as never;
    made.edges.push({ id: 'gate', source_node_id: 'count', source_port_id: 'total', target_node_id: 'show', target_port_id: '__run' });
    return made;
  };

  it('finds a wire into a ◆ that can never carry true', () => {
    expect(problemsIn(gated('number')).map((p) => p.problem).join(' ')).toMatch(/only the value true opens/);
  });

  it('is content with a boolean, and with a port that may carry anything', () => {
    expect(problemsIn(gated('boolean'))).toEqual([]);
    expect(problemsIn(gated('any'))).toEqual([]);
  });
});

describe('what check finds on a wire', () => {
  // count.total goes into say.total; count's output.js says what comes out, by its example.
  const wired = (given: unknown, dataType: string, multi = false): Graph => {
    const made = graph({ output: `module.exports = ${JSON.stringify({ total: given })};` });
    Object.assign(made.nodes[1].inputs[0], { data_type: dataType, multi });
    return made;
  };
  const said = (made: Graph) => problemsIn(made).map((p) => `${p.where}: ${p.problem}`).join(' ');

  it('finds a record going into a port that takes a number', () => {
    expect(said(wired({ a: 1 }, 'number'))).toMatch(/edge "e1".*gives object, and the port takes number/);
  });

  it('judges a list by its items where the port is not itself a list', () => {
    expect(said(wired([1], 'number', true))).toBe('');
    expect(said(wired(['one'], 'number', true))).toMatch(/gives string/);
    expect(said(wired([1], 'list'))).toBe('');
  });

  it('says nothing where one end has said nothing: no output.js, or a port that takes anything', () => {
    expect(problemsIn(graph())).toEqual([]);
    expect(said(wired({ a: 1 }, 'any'))).toBe('');
    expect(said(wired({ a: 1 }, 'text'))).toBe('');
    expect(said(wired(null, 'number'))).toBe('');
  });
});

describe('what check finds of an end point that writes', () => {
  /** An end point set to write to a file at *path*, with a path wired into it or not. */
  const writing = (path: string, wired = false): Graph => parseGraph({
    metadata: { name: 'Writes' },
    nodes: [
      { id: 'made', node_type: 'data', label: 'Made', description: 'What is written.', inputs: [], outputs: [port('output', 'output')], config: { data_value: 'x' } },
      { id: 'where', node_type: 'data', label: 'Where', description: 'Where it goes.', inputs: [], outputs: [port('output', 'output')], config: { data_value: 'out.txt' } },
      { id: 'saved', node_type: 'end', label: 'Saved', inputs: [port('value', 'input'), port('path', 'input')], outputs: [], config: { write_mode: 'file', path } },
    ],
    edges: [
      { id: 'v', source_node_id: 'made', source_port_id: 'output', target_node_id: 'saved', target_port_id: 'value' },
      ...(wired ? [{ id: 'p', source_node_id: 'where', source_port_id: 'output', target_node_id: 'saved', target_port_id: 'path' }] : []),
    ],
  });

  it('finds one set to write a file that names none: nothing is written, and nothing said', () => {
    const found = problemsIn(writing(''));
    expect(found.map((p) => [p.where, p.problem])).toEqual([['node "saved"', 'It writes to a file, and names none: nothing is written.']]);
  });

  it('says nothing where it names a file, or a path is wired into its "path"', () => {
    expect(problemsIn(writing('out/result.txt'))).toEqual([]);
    expect(problemsIn(writing('', true))).toEqual([]);
  });
});

describe('what check finds of what a call sends a start point', () => {
  /** A start point a call starts, sent *example* when nobody sends it anything, and a node whose input takes *field* of it. */
  const called = (example: Record<string, unknown>, field: string): Graph => parseGraph({
    metadata: { name: 'Called' },
    nodes: [
      { id: 'ask', node_type: 'start', label: 'Ask', config: { started_by: 'call', values: example } },
      { id: 'say', node_type: 'end', label: 'Said', inputs: [{ ...port('value', 'input'), field }], outputs: [], config: {} },
    ],
    edges: [{ id: 'e', source_node_id: 'ask', source_port_id: 'data', target_node_id: 'say', target_port_id: 'value' }],
  });

  it('finds an input taking a part its example does not hold: run on its own, it is handed nothing', () => {
    const [problem] = problemsIn(called({ topic: 'cats' }, 'subject'));
    expect(problem.where).toBe('node "say", input "value"');
    expect(problem.problem).toBe('It takes "subject" of what "ask" is sent, and what a call sends it for example holds no "subject": run on its own, it is handed nothing there.');
    expect(problem.fix).toBe('Add "subject" to what "ask" is sent for example, or take one of what it holds: "topic".');
  });

  it('says nothing of a part the example holds -- inside another, too -- nor where there is no example to hold it', () => {
    expect(problemsIn(called({ topic: 'cats' }, 'topic'))).toEqual([]);
    expect(problemsIn(called({ file: { content: 'x' } }, 'file.content'))).toEqual([]);
    expect(problemsIn(called({}, 'subject'))).toEqual([]);
  });
});

describe('what check finds in a project folder', () => {
  it('finds a folder no node owns, and a file nothing reads', async () => {
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
  });

  it('finds a file in the page\'s folder nothing reads -- and takes an empty page.json as a page of no blocks', async () => {
    await writeProject(dir, graph());
    await mkdir(join(dir, 'page'));
    await writeFile(join(dir, 'page', 'page.json'), '[]\n');
    expect((await checkPath(dir)).problems).toEqual([]);

    const paged = graph();
    paged.page = { blocks: [{ id: 'note', kind: 'text', label: 'Note' }] };
    await writeProject(dir, paged);
    await writeFile(join(dir, 'page', 'style.css'), '');
    expect((await checkPath(dir)).problems.map((p) => [p.where, p.problem, p.fix])).toEqual([
      ['page/style.css', 'Nothing reads this file.', 'What is read here: "page.json".'],
    ]);
  });

  it('is content with a folder for a node that keeps no writing yet', async () => {
    await writeProject(dir, graph());
    // Every node has a folder since each is given its interface.json; an empty one is as fine.
    await mkdir(join(dir, 'nodes', 'show'), { recursive: true });
    expect((await checkPath(dir)).problems).toEqual([]);
  });

  it('reports a project that cannot be read, rather than failing', async () => {
    await writeFile(join(dir, 'flow.json'), '{ broken');
    const { problems, graph: read } = await checkPath(dir);
    expect(read).toBeNull();
    expect(problems[0].problem).toMatch(/not valid JSON/);
  });
});

/**
 * A graph inside a node is checked by the same function that checks the one
 * above it, so everything it can get wrong is already covered. What is here is
 * the boundary between the two, and the few things that only make sense in
 * there.
 */
describe('a graph inside a node', () => {
  const holder = (inner: unknown, description = '') => parseGraph({
    metadata: { name: 'Outer' },
    nodes: [
      { id: 'part', node_type: 'subgraph', label: 'Part', description, inputs: [], outputs: [], config: { subgraph: inner } },
      { id: 'show', node_type: 'end', label: 'Show', inputs: [port('value', 'input')], outputs: [], config: {} },
    ],
    edges: [],
  });

  const inner = (nodes: unknown[], edges: unknown[] = [], blocks: unknown[] = []) => ({ metadata: { name: 'Inner' }, nodes, edges, page: { blocks } });

  const said = (problems: { where: string; problem: string }[]) => problems.map((p) => `${p.where}: ${p.problem}`);

  it('reports what is wrong in there, saying which node it is in', () => {
    const problems = problemsIn(holder(inner([
      { id: 'broken', node_type: 'code', label: 'Broken', inputs: [], outputs: [port('out', 'output')], config: { code: '' } },
      { id: 'out', node_type: 'end', label: 'Out', inputs: [port('value', 'input')], outputs: [], config: {} },
    ])));
    expect(said(problems)).toContainEqual(expect.stringContaining('node "part" ▸ node "broken": Its code.js holds no code yet'));
  });

  it('wants something to come out of it, in its own words', () => {
    const problems = problemsIn(holder(inner([
      { id: 'lonely', node_type: 'code', label: 'Lonely', inputs: [], outputs: [], config: { code: 'function run() { return {}; }' } },
    ])));
    expect(said(problems)).toContainEqual(expect.stringContaining('node "part" ▸ graph: Nothing comes out'));
  });

  it('refuses two ports of one name, and an end point carrying more than one value', () => {
    const problems = problemsIn(holder(inner([
      { id: 'a', node_type: 'start', label: 'Text', inputs: [], outputs: [], config: { started_by: 'call' } },
      { id: 'b', node_type: 'start', label: 'Text', inputs: [], outputs: [], config: { started_by: 'call' } },
      { id: 'two', node_type: 'end', label: 'Two', inputs: [port('one', 'input'), port('other', 'input')], outputs: [], config: {} },
    ])));
    expect(said(problems)).toContainEqual(expect.stringContaining('that is two ports of the same name'));
    // Two values, and 'path' -- which says where to write -- is not one of them.
    expect(said(problems)).toContainEqual(expect.stringContaining('carrying one value; this one has 2'));
  });

  it('says a page in there would never be shown, and a start point in there the page starts never started', () => {
    const problems = problemsIn(holder(inner([
      { id: 'press', node_type: 'start', label: 'Press', inputs: [], outputs: [], config: { started_by: 'page' } },
      { id: 'out', node_type: 'end', label: 'Out', inputs: [port('value', 'input')], outputs: [], config: {} },
    ], [{ id: 'p', source_node_id: 'press', source_port_id: 'data', target_node_id: 'out', target_port_id: 'value' }],
    [{ id: 'shown', kind: 'text_io', mode: 'output', shows: 'out' }])));
    expect(said(problems)).toContainEqual(expect.stringContaining('a page in here would never be shown'));
    expect(said(problems)).toContainEqual(expect.stringContaining('started by the page, and a page belongs to the graph at the top'));
  });

  it('calls a described but empty part out, because that is a plan and not a graph', () => {
    const problems = problemsIn(holder(inner([]), 'Summarise the paper.'));
    expect(said(problems)).toContainEqual(expect.stringContaining('described and empty'));
  });

  it('says so when what it holds is not a graph at all', () => {
    const problems = problemsIn(holder('not a graph'));
    expect(said(problems)).toContainEqual(expect.stringContaining('cannot be read'));
  });

  it('is quiet about a part that is right', async () => {
    const good = holder(inner([
      { id: 'text', node_type: 'start', label: 'Text', inputs: [], outputs: [], config: { started_by: 'call', values: { text: 'hi' } } },
      { id: 'out', node_type: 'end', label: 'Short', inputs: [{ ...port('value', 'input'), field: 'text' }], outputs: [], config: {} },
    ], [{ id: 'i1', source_node_id: 'text', source_port_id: 'data', target_node_id: 'out', target_port_id: 'value' }]));
    expect(problemsIn(good)).toEqual([]);

    // And on disk, where its folder is a project folder of its own.
    await writeProject(dir, good);
    const { problems } = await checkPath(dir);
    expect(problems).toEqual([]);
  });
});
