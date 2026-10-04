import { describe, it, expect } from 'vitest';
import { NODE_KINDS } from '../../app/document/nodeKinds';
import { NODE_BUILDERS } from '../../app/elements/registry';
import { inputSources, lastRunInputs, outputTargets } from './generationContext';
import type { ExecutionResult } from '../../app/graph';
import { filePorts } from '../../../graph/execution/fileInputs.ts';
import { registry as engineRegistry } from '../../../graph/nodes/registry.ts';

const edge = (source: string, target: string) => ({ source, target, sourceHandle: 'output', targetHandle: 'input' });

describe('what ✨ is told of a node\'s neighbours', () => {
  it('describes data nodes on both sides by their format', () => {
    const source = NODE_KINDS.data.create('source');
    source.label = 'Input records';
    source.config.data_format = 'structure';
    source.description = 'columns: id integer, name text';
    const processor = NODE_KINDS.code.create('processor');
    const target = NODE_KINDS.data.create('target');
    target.label = 'Result map';
    target.config.data_format = 'structure';
    const nodes = [source, processor, target];
    const wires = [edge('source', 'processor'), edge('processor', 'target')];

    expect(inputSources('processor', nodes, wires, true).input)
      .toContain('"Input records" (port "Value"), which hands on: Persisted value; structure: columns: id integer, name text');
    expect(outputTargets('processor', nodes, wires, true).output).toContain('"Result map" (port "Update"), which wants what it stores: structure');
  });

  it('tells what a data node holds, the start of it as JSON: its keys are what the node after it reads', () => {
    const capitals = NODE_KINDS.data.create('capitals');
    capitals.label = 'Capitals';
    capitals.description = 'Ten European capitals with their population';
    capitals.config.data_format = 'structure';
    capitals.config.data_value = [{ capital: 'Paris', country: 'France', population: 2102650 }, { capital: 'Rome', country: 'Italy', population: 2749031 }];
    const sorter = NODE_KINDS.code.create('sorter');
    const said = () => inputSources('sorter', [capitals, sorter], [edge('capitals', 'sorter')], true).input;
    expect(said()).toContain('structure: Ten European capitals with their population -- it holds: '
      + '[{"capital":"Paris","country":"France","population":2102650},{"capital":"Rome","country":"Italy","population":2749031}]');
    // A long one is cut, saying how much was left out; one that holds nothing says only what it is.
    capitals.config.data_value = Array.from({ length: 100 }, (_, n) => ({ capital: `City ${n}`, population: n }));
    expect(said()).toMatch(/it holds: \[\{"capital":"City 0","population":0\},[^]{500,}… \(\d+ more characters\)$/);
    capitals.config.data_value = null;
    expect(said()).toMatch(/structure: Ten European capitals with their population$/);
  });

  it('describes a non-data upstream node too', () => {
    // The old version considered `data` nodes only, so this -- the commonest
    // wiring there is -- produced no context at all.
    const input = NODE_KINDS.folder.create('src');
    input.label = 'Reports folder';
    const code = NODE_KINDS.code.create('worker');

    expect(inputSources('worker', [input, code], [edge('src', 'worker')], true).input)
      .toContain('port "Files" carries a list of file paths');
  });

  it('carries an upstream ai node\'s output definition', () => {
    const ai = NODE_KINDS.ai.create('classifier');
    ai.label = 'Classifier';
    ai.config.output_definition = 'module.exports = { "label": "spam" };';
    const code = NODE_KINDS.code.create('worker');

    expect(inputSources('worker', [ai, code], [edge('classifier', 'worker')], true).input)
      .toContain('what its output.js defines:\nmodule.exports = { "label": "spam" };');
  });

  it('is empty for an unconnected node rather than noise', () => {
    const code = NODE_KINDS.code.create('lonely');
    expect(inputSources('lonely', [code], [], true)).toEqual({});
    expect(outputTargets('lonely', [code], [], true)).toEqual({});
  });
});

describe('what ✨ is told a start point a call starts is sent', () => {
  const called = () => {
    const start = NODE_KINDS.start.create('ask');
    start.label = 'Ask';
    start.config.started_by = 'call';
    start.config.values = { topic: 'cats', size: 3 };
    return start;
  };

  it('is the part an input takes of what a call sends it, for example -- or all of it', () => {
    const code = NODE_KINDS.code.create('worker');
    code.inputs = [{ ...code.inputs[0], field: 'topic' }];
    const wire = [{ source: 'ask', sourceHandle: 'data', target: 'worker', targetHandle: code.inputs[0].id }];
    expect(inputSources('worker', [called(), code], wire, true).input).toContain('"topic" of what a call sends it -- for example "cats"');
    code.inputs = [{ ...code.inputs[0], field: undefined }];
    expect(inputSources('worker', [called(), code], wire, true).input).toContain('its values what a call sends -- for example {"topic":"cats","size":3}');
  });
});

describe('what a node says it hands on', () => {
  it('says what a folder node hands on: its files, and how many', () => {
    expect(NODE_BUILDERS.folder.describeOutput(NODE_KINDS.folder.create('f'))).toContain('port "Files" carries a list of file paths');
  });

  it('describes a code or an ai node by its output.js -- an ai node without one hands on its answer', () => {
    const code = NODE_KINDS.code.create('c');
    code.config.output_definition = 'module.exports = { "rows": [] };';
    expect(NODE_BUILDERS.code.describeOutput(code)).toBe('what its output.js defines:\nmodule.exports = { "rows": [] };');
    expect(NODE_BUILDERS.code.describeOutput(NODE_KINDS.code.create('c'))).toBe('');
    expect(NODE_BUILDERS.ai.describeOutput(NODE_KINDS.ai.create('a'))).toBe('the model\'s answer, as text');
  });
});

describe('what a node received on the last run', () => {
  const resultWith = (inputs: Record<string, unknown>): ExecutionResult => ({
    status: 'success',
    node_results: [{ node_id: 'worker', status: 'success', inputs, outputs: {} }],
    outputs: {},
  } as ExecutionResult);

  it('is what arrived on each input, as it arrived', () => {
    expect(lastRunInputs('worker', resultWith({ rows: [{ id: 1 }, { id: 2 }] }))).toEqual({ rows: [{ id: 1 }, { id: 2 }] });
  });

  it('is nothing before the first run, or for another node', () => {
    expect(lastRunInputs('worker', null)).toBeUndefined();
    expect(lastRunInputs('someone-else', resultWith({ a: 1 }))).toBeUndefined();
    expect(lastRunInputs('worker', resultWith({}))).toBeUndefined();
  });
});

describe('a node that is handed the text of a file', () => {
  const reader = () => {
    const node = NODE_KINDS.code.create('worker');
    node.inputs = [
      { id: 'csv', name: 'CSV', kind: 'input', data_type: 'file_path', multi: false, required: false },
      { id: 'top', name: 'Top', kind: 'input', data_type: 'text', multi: false, required: false },
    ] as typeof node.inputs;
    return node;
  };

  it('names the ports the server must read before it tries generated code on the sample: the ones ticked to read', () => {
    expect(filePorts(reader(), engineRegistry)).toEqual(['csv']);
    // A kind that takes a path as a path reads nothing, whatever its ports say.
    const out = NODE_KINDS.end.create('sink');
    expect(out.inputs.some((port) => port.data_type === 'file_path')).toBe(true);
    expect(filePorts(out, engineRegistry)).toEqual([]);
  });

  it('never reads an input that did not say so, however it is wired', () => {
    // The wire used to decide for a port typed `any`: a sentence wired in from
    // somewhere that declared a path became "no such file".
    const node = NODE_KINDS.code.create('worker');
    expect(node.inputs[0].data_type).toBe('any');
    expect(filePorts(node, engineRegistry)).toEqual([]);
  });

  it('keeps the path a run recorded on the port it read, which is the file ✨ Input may write from', () => {
    const result = {
      status: 'success', outputs: {},
      node_results: [{ node_id: 'worker', status: 'success', inputs: { csv: 'data/people.csv', top: '5' }, outputs: {} }],
    } as ExecutionResult;
    expect(lastRunInputs('worker', result)?.csv).toBe('data/people.csv');
    expect(filePorts(reader(), engineRegistry)).toEqual(['csv']);
  });
});

describe('duplicate neighbours', () => {
  it('states a shared neighbour once, not once per wire', () => {
    // Two wires into the same port of the same node are two edges and one fact.
    const code = NODE_KINDS.code.create('worker');
    const out = NODE_KINDS.end.create('sink');
    out.label = 'Result';
    const wire = { source: 'worker', sourceHandle: 'output', target: 'sink', targetHandle: 'value' };

    expect(outputTargets('worker', [code, out], [wire, { ...wire }], true).output)
      .toBe('"Result" (port "Value"), which wants the run\'s result');
  });
});

describe('what an end point wants', () => {
  it('tells the node feeding it what the result is and where it goes, not only its port\'s own words', () => {
    // A new end point's value port says nothing, so the node wired into it
    // was written for nothing in particular.
    const out = NODE_KINDS.end.create('sink');
    out.label = 'Table';
    out.description = 'One row per country';
    out.config.write_mode = 'file';
    out.config.path = 'out/table.csv';
    const code = NODE_KINDS.code.create('worker');

    const targets = outputTargets('worker', [code, out], [
      { source: 'worker', sourceHandle: 'output', target: 'sink', targetHandle: 'value' },
    ], true);
    expect(targets.output).toContain('One row per country');
    expect(targets.output).toContain('written to the file "out/table.csv"');
  });
});

describe('what a node is wired to, as the panel and ✨ say it', () => {
  it('names where each output goes, node and port', () => {
    const code = NODE_KINDS.code.create('worker');
    const out = NODE_KINDS.end.create('shown');
    out.label = 'Report';
    const targets = outputTargets('worker', [code, out], [
      { source: 'worker', target: 'shown', sourceHandle: 'output', targetHandle: 'value' },
    ]);
    expect(targets).toEqual({ output: '"Report" (port "Value")' });
  });

  it('names what feeds each input -- plainly for the panel, with what it hands on for ✨', () => {
    const ai = NODE_KINDS.ai.create('writer');
    ai.label = 'Writer';
    ai.config.output_definition = 'module.exports = { "output": "one short paragraph" };';
    const code = NODE_KINDS.code.create('worker');
    const wires = [{ source: 'writer', target: 'worker', sourceHandle: 'output', targetHandle: 'input' }];
    expect(inputSources('worker', [ai, code], wires)).toEqual({ input: '"Writer" (port "Output")' });
    expect(inputSources('worker', [ai, code], wires, true).input)
      .toMatch(/^"Writer" \(port "Output"\), which hands on: [^]*one short paragraph/);
  });

  it('tells a node feeding an end point a chart shows what the chart wants -- the block says it, at its size', () => {
    const code = NODE_KINDS.code.create('worker');
    const end = { ...NODE_KINDS.end.create('sizes'), label: 'Sizes' };
    const page = [{ id: 'w1', kind: 'plot_window', label: 'Sizes chart', shows: 'sizes' } as never];
    const told = outputTargets('worker', [code, end], [
      { source: 'worker', sourceHandle: 'output', target: 'sizes', targetHandle: 'value' },
    ], true, page);
    expect(told.output).toContain('"Sizes" (port "Value")');
    expect(told.output).toContain('shown by a chart block "Sizes chart", which wants');
    expect(told.output).toContain('{"kind": "bars"|"columns"|"line"|"donut"');
    expect(told.output).toMatch(/shown at about \d+ x \d+ px/);
  });

  it('tells a node fed by a start point what the page sends it -- the one value its input takes, by its field', () => {
    const start = NODE_KINDS.start.create('go');
    const code = NODE_KINDS.code.create('worker');
    code.inputs[0] = { ...code.inputs[0], field: 'file.content' };
    const page = [{ id: 'file', kind: 'input_picker', label: 'CSV', mode: 'file', sends_to: ['go'] } as never];
    const wires = [{ source: 'go', sourceHandle: 'data', target: 'worker', targetHandle: 'input' }];
    expect(inputSources('worker', [start, code], wires, false, page).input).toBe('"Start" (port "Data"), as "file.content"');
    // Rebuilt by hand: an input taking "CSV file · content" was described as
    // that part and then as the whole {"path", "content"} object, and ✨ wrote
    // code reading `inputs.input.content`. The part is said alone.
    const told = inputSources('worker', [start, code], wires, true, page).input;
    expect(told).toBe('"Start" (port "Data"), as "file.content", which hands on: only "content" of what a file picker block "CSV" sends: '
      + 'what is in it -- a document read as its text');
    expect(told).not.toContain('"path"');
    // Without a field: the whole package, each block under its id.
    code.inputs[0] = { ...code.inputs[0], field: undefined };
    expect(inputSources('worker', [start, code], wires, true, page).input).toContain('one package {"event", "values"}, its values "file": what a file picker block "CSV" sends');
  });
});

describe('a new node', () => {
  it('starts with no description, so ✨ on a fresh ai or code node has nothing to invent code for', () => {
    expect(NODE_KINDS.ai.create('a').description).toBe('');
    expect(NODE_KINDS.code.create('c').description).toBe('');
  });
});

describe('what ✨ is told of a node wired on both sides', () => {
  it('says what each wire carries and what the node at the other end wants', () => {
    const input = NODE_KINDS.folder.create('src');
    input.label = 'Notes';
    const code = NODE_KINDS.code.create('worker');
    const end = { ...NODE_KINDS.end.create('findings'), label: 'Findings' };
    const page = [{ id: 'w1', kind: 'table', label: 'Findings', shows: 'findings' } as never];
    const edges = [
      { id: 'a', source: 'src', target: 'worker', sourceHandle: input.outputs[0].id, targetHandle: 'input' },
      { id: 'b', source: 'worker', target: 'findings', sourceHandle: 'output', targetHandle: 'value' },
    ];
    expect(inputSources('worker', [input, code, end], edges, true, page).input).toMatch(/^"Notes" \(port "[^"]+"\), which hands on: /);
    expect(outputTargets('worker', [input, code, end], edges, true, page).output).toContain('which wants rows: a list of objects');
  });
});
