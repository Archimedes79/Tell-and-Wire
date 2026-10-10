import { describe, it, expect } from 'vitest';
import { NODE_KINDS } from '../../app/document/nodeKinds';
import { inputSources, outputTargets } from './generationContext';

const edge = (source: string, target: string, targetHandle = 'input', sourceHandle = 'output') => ({ source, target, sourceHandle, targetHandle });

describe('what ✨ is told of a node\'s neighbours', () => {
  it('describes data nodes on both sides by their fields and their own words', () => {
    const source = NODE_KINDS.data.create('source');
    source.label = 'Input records';
    source.config.data_value = { id: 1, name: 'Ada' };
    source.description = 'columns: id integer, name text';
    const processor = NODE_KINDS.code.create('processor');
    const target = NODE_KINDS.data.create('target');
    target.label = 'Result map';
    target.config.data_value = { total: 0 };
    const nodes = [source, processor, target];
    const wires = [edge('source', 'processor', 'input', 'all'), edge('processor', 'target', 'total')];

    const fed = inputSources('processor', nodes, wires, true).input;
    expect(fed).toContain('"Input records"');
    expect(fed).toContain('a struct of the fields "id", "name": columns: id integer, name text');
    // One field's wire carries that field alone.
    expect(inputSources('processor', nodes, [edge('source', 'processor', 'input', 'name')], true).input).toContain('the field "name" of a struct: columns: id integer, name text -- as rounds fill it, it holds: "Ada"');
    const stored = outputTargets('processor', nodes, wires, true).output;
    expect(stored).toContain('"Result map"');
    expect(stored).toContain('the field "total" it stores');
  });

  it('tells what a data node holds, the start of it as JSON: its keys are what the node after it reads', () => {
    const capitals = NODE_KINDS.data.create('capitals');
    capitals.label = 'Capitals';
    capitals.description = 'Ten European capitals with their population';
    capitals.config.data_value = { capitals: [{ capital: 'Paris', country: 'France', population: 2102650 }, { capital: 'Rome', country: 'Italy', population: 2749031 }] };
    const sorter = NODE_KINDS.code.create('sorter');
    const said = () => inputSources('sorter', [capitals, sorter], [edge('capitals', 'sorter', 'input', 'all')], true).input;
    expect(said()).toContain('a struct of the fields "capitals": Ten European capitals with their population; "all" is all of them -- as rounds fill it, it holds: '
      + '{"capitals":[{"capital":"Paris","country":"France","population":2102650},{"capital":"Rome","country":"Italy","population":2749031}]}');
    // A long one is cut, saying how much was left out; one that holds nothing says only what it is.
    capitals.config.data_value = { capitals: Array.from({ length: 100 }, (_, n) => ({ capital: `City ${n}`, population: n })) };
    expect(said()).toMatch(/it holds: \{"capitals":\[\{"capital":"City 0","population":0\},[^]{500,}… \(\d+ more characters\)$/);
    capitals.config.data_value = {};
    expect(said()).toMatch(/a struct of no fields yet: Ten European capitals with their population; "all" is all of them$/);
  });

  it('tells a node fed by a start point what the page sends it -- the one value its input takes, by its field', () => {
    const start = NODE_KINDS.start.create('go');
    const code = NODE_KINDS.code.create('worker');
    code.inputs[0] = { ...code.inputs[0], field: 'file.content' };
    const page = [{ id: 'file', kind: 'input_picker', label: 'CSV', mode: 'file', sends_to: ['go'] } as never];
    const wires = [{ source: 'go', sourceHandle: 'data', target: 'worker', targetHandle: 'input' }];
    // The part is said alone: told as the whole {"path", "content"} object too, ✨ wrote code reading `inputs.input.content`.
    const told = inputSources('worker', [start, code], wires, true, page).input;
    expect(told).toContain('"file.content"');
    expect(told).toContain('"content"');
    expect(told).not.toContain('"path"');
    // Without a field: the whole package, each block under its id.
    code.inputs[0] = { ...code.inputs[0], field: undefined };
    expect(inputSources('worker', [start, code], wires, true, page).input).toContain('"file"');
  });

  it('says what each wire carries and what the node at the other end wants', () => {
    const input = NODE_KINDS.data.create('src');
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
