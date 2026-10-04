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
});
