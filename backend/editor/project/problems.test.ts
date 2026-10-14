import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseGraph, type Graph } from '../../../graph/graph.ts';
import { problemsIn } from '../../../gui/authoring/check.ts';
import { checkPath } from './folderCheck.ts';
import { forgetSeen } from '../../deployment/project/folder.ts';
import { writeProject } from '../../authoring/write.ts';

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
      ['node "say"', 'Its text is empty: nothing says what it should do, and Auto generate writes from that text.'],
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

    // A "field" is a key of what a wire brings: with no wire it names nothing.
    const lone = graph();
    lone.nodes[1].inputs.push({ ...port('state', 'input'), field: 'state.count' } as never);
    expect(said(lone)).toMatch(/Its input "state" takes "state.count" of what arrives, and nothing is wired to it/);
    // A loop goes through a memory: the wire back to the node that reads it is a read. Where the schedule stands the memory before that node, the table is what is wrong, and it is said for the wire.
    const memory = (schedule?: string[]): Graph => parseGraph({
      metadata: { name: 'Loop' },
      nodes: [
        { id: 'count', node_type: 'data', label: 'Count', description: 'Counts.', inputs: [], outputs: [], config: { data_value: { total: 0 } } },
        { id: 'add', node_type: 'code', label: 'Add', description: 'Adds one.', inputs: [port('n', 'input')], outputs: [port('next', 'output')], config: { code: 'function run(i) { return { next: i.n + 1 }; }' } },
        { id: 'show', node_type: 'end', label: 'Show', inputs: [port('value', 'input')], outputs: [], config: {} },
      ],
      edges: [
        { id: 'r', source_node_id: 'count', source_port_id: 'total', target_node_id: 'add', target_port_id: 'n' },
        { id: 'w', source_node_id: 'add', source_port_id: 'next', target_node_id: 'count', target_port_id: 'total' },
        { id: 's', source_node_id: 'count', source_port_id: 'total', target_node_id: 'show', target_port_id: 'value' },
      ],
      ...(schedule ? { schedule } : {}),
    });
    expect(said(memory())).toBe('');
    expect(said(memory(['add count show']))).toBe('');
    expect(problemsIn(memory(['count add show']))).toEqual([expect.objectContaining({ problem: expect.stringMatching(/puts "count" before "add"/), fix: expect.stringMatching(/later column/) })]);
    // A loop no memory closes is the wires' own, whatever the table says.
    const circle = memory(['add count show']);
    circle.nodes.push({ id: 'twin', node_type: 'code', label: 'Twin', description: 'Passes it on.', inputs: [port('n', 'input')], outputs: [port('next', 'output')], config: { code: 'function run(i) { return { next: i.n }; }' } } as never);
    circle.edges.push(
      { id: 'x', source_node_id: 'add', source_port_id: 'next', target_node_id: 'twin', target_port_id: 'n' },
      { id: 'y', source_node_id: 'twin', source_port_id: 'next', target_node_id: 'add', target_port_id: 'n' },
    );
    expect(problemsIn(circle).map((one) => one.problem)).toContainEqual(expect.stringMatching(/feed each other in a circle/));

    // What only reads a memory as it was before the round has no event to run it: where a start point makes rounds, that is said.
    const reader = (schedule: string[]): Graph => parseGraph({
      metadata: { name: 'Reader' },
      nodes: [
        { id: 'go', node_type: 'start', label: 'Go', inputs: [], outputs: [port('data', 'output')], config: {} },
        { id: 'count', node_type: 'data', label: 'Count', description: 'Counts.', inputs: [], outputs: [], config: { data_value: { total: 0 } } },
        { id: 'add', node_type: 'code', label: 'Add', description: 'Adds one.', inputs: [port('n', 'input')], outputs: [port('next', 'output')], config: { code: 'function run(i) { return { next: i.n + 1 }; }' } },
        { id: 'show', node_type: 'end', label: 'Show', inputs: [port('value', 'input')], outputs: [], config: {} },
      ],
      edges: [
        { id: 'g', source_node_id: 'go', source_port_id: 'data', target_node_id: 'add', target_port_id: '__run' },
        { id: 'r', source_node_id: 'count', source_port_id: 'total', target_node_id: 'add', target_port_id: 'n' },
        { id: 'w', source_node_id: 'add', source_port_id: 'next', target_node_id: 'count', target_port_id: 'total' },
        { id: 's', source_node_id: 'count', source_port_id: 'total', target_node_id: 'show', target_port_id: 'value' },
      ],
      schedule,
    });
    expect(said(reader(['go add count show']))).toBe('');
    expect(problemsIn(reader(['go show add count']))).toEqual([expect.objectContaining({
      where: 'node "show"', problem: expect.stringMatching(/only reads "Count" as it was before the run/), fix: expect.stringMatching(/to the right of that one/),
    })]);

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

    const guided = graph();
    guided.gui = { blocks: [{ id: 'answer', kind: 'text_io', mode: 'output', label: 'Answer', shows: 'show' }] };
    expect(problemsIn(guided)).toEqual([]);
    guided.gui.blocks.push({ id: 'go', kind: 'button', label: 'Go', fires: 'nowhere' });
    expect(where(guided)).toEqual([['the GUI, block "go"', 'It fires "nowhere", which is no start point of the graph: it starts (none).']]);
  });

  it('in a project folder: a folder no node owns, a file nothing reads, and a project that cannot be read', async () => {
    await writeProject(dir, graph());
    await mkdir(join(dir, 'nodes', 'old_step'));
    await writeFile(join(dir, 'nodes', 'old_step', 'code.js'), '');
    await writeFile(join(dir, 'nodes', 'say', 'instructions.md'), 'Written, never sent.');
    const { problems } = await checkPath(dir);
    expect(problems.map((p) => [p.where, p.problem])).toEqual([
      ['nodes/old_step', 'This folder belongs to no node in graph-nodes.json.'],
      ['nodes/say/instructions.md', 'Nothing reads this file.'],
    ]);
    expect(problems[1].fix).toMatch(/"prompt.md"/);

    await writeFile(join(dir, 'graph-flow.json'), '{ broken');
    const broken = await checkPath(dir);
    expect(broken.graph).toBeNull();
    expect(broken.problems[0].problem).toMatch(/not valid JSON/);
  });
});
