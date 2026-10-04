import { describe, it, expect } from 'vitest';
import { batchItems, mergeBatchOutputs } from './batching.ts';
import type { GraphNode, Port } from '../graph.ts';

function port(id: string, kind: 'input' | 'output', multi: boolean): Port {
  return { id, name: id, kind, data_type: 'any', multi, required: false, description: '' };
}

function node(inputs: Port[] = [], outputs: Port[] = []): GraphNode {
  return {
    id: 'n', node_type: 'code', label: 'n', description: '',
    position: { x: 0, y: 0 }, inputs, outputs, config: {},
  };
}

describe('running once per item', () => {
  it('fans out over declared-multi ports only, an empty list is zero runs, and the results are collected into a list however many there were', () => {
    // A list on a single-valued port is one value that happens to be a list.
    const n = node([port('many', 'input', true), port('one', 'input', false)], [port('out', 'output', false), port('error', 'output', false)]);
    expect(batchItems(n, { many: ['a', 'b'], one: [1, 2, 3] })).toEqual({
      items: [{ many: 'a', one: [1, 2, 3] }, { many: 'b', one: [1, 2, 3] }],
      fanned: true,
    });
    expect(batchItems(n, { many: [], one: 1 })).toEqual({ items: [], fanned: true });
    expect(batchItems(n, { many: 'x', one: 1 })).toEqual({ items: [{ many: 'x', one: 1 }], fanned: false });
    // A short list is padded, so items stay aligned with their inputs.
    const two = node([port('a', 'input', true), port('b', 'input', true)]);
    expect(batchItems(two, { a: [1, 2], b: [9] }).items).toEqual([{ a: 1, b: 9 }, { a: 2, b: null }]);

    // What came back: where nothing was fanned out, what the one call returned; otherwise a list, even of one or none.
    expect(mergeBatchOutputs(n, [{ out: 42 }], false)).toEqual({ out: 42 });
    expect(mergeBatchOutputs(n, [{ out: 1 }, { out: 2 }], true)).toEqual({ out: [1, 2] });
    expect(mergeBatchOutputs(n, [{ out: 1 }], true)).toEqual({ out: [1] });
    expect(mergeBatchOutputs(n, [], true)).toEqual({ out: [] });
    // An item that leaves a port out is a null there: the lists stay as long as the items are many.
    expect(mergeBatchOutputs(n, [{ out: 1 }, { out: 2, note: 'b' }, { out: 3 }], true)).toEqual({ out: [1, 2, 3], note: [null, 'b', null] });
    // A port declared multi is flattened.
    expect(mergeBatchOutputs(node([], [port('out', 'output', true)]), [{ out: [1, 2] }, { out: [3] }], true)).toEqual({ out: [1, 2, 3] });
  });
});
