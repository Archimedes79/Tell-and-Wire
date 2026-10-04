import { describe, it, expect } from 'vitest';
import { inferSchema, merge, mismatches } from './interface.ts';
import { executeGraph } from './executor.ts';
import { registry } from '../nodes/registry.ts';
import { parseGraph } from '../graph.ts';
import { quietRuntime } from '../test/fakes.ts';

describe('an interface inferred from a run', () => {
  it('describes what a node produced, port by port, and a list by what its items have in common -- and holds a later run to it', () => {
    expect(inferSchema({ rows: [{ Country: 'India', Population: 1450000000 }], count: 20, note: null })).toEqual({
      type: 'object',
      properties: {
        rows: {
          type: 'array',
          items: {
            type: 'object',
            properties: { Country: { type: 'string' }, Population: { type: 'integer' } },
            required: ['Country', 'Population'],
          },
        },
        count: { type: 'integer' },
        // Null said nothing about the port; it is not required either.
        note: {},
      },
      required: ['rows', 'count'],
    });
    expect(inferSchema([{ a: 1, b: 'x' }, { a: 2.5 }])).toEqual({
      type: 'array',
      items: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'string' } }, required: ['a'] },
    });
    expect(merge({ type: 'string' }, { type: 'integer' })).toEqual({ type: ['integer', 'string'] });
    expect(inferSchema([])).toEqual({ type: 'array' });
    expect(inferSchema([1, null, 2])).toEqual({ type: 'array', items: { type: 'integer' } });

    // One missing Population must not make the column "anything".
    const schema = inferSchema({ rows: [{ Population: 1 }, { Population: null }], count: 3 });
    expect(mismatches({ rows: [{ Population: 5 }, { Population: 7 }], count: 9 }, schema)).toEqual([]);
    expect(mismatches({ rows: [{ Population: 'many' }], count: 3 }, schema))
      .toEqual(['output "rows" at [0].Population is text; output.js says a number']);
    expect(mismatches({ rows: [] }, schema)).toEqual(['output "count" is missing']);
    expect(mismatches({ rows: 'none', count: 1 }, schema)).toEqual(['output "rows" is text; output.js says a list']);
    // A whole number in the example promises a number, not a whole one: 135.5 shares are shares.
    expect(mismatches({ rows: [], count: 2.5 }, schema)).toEqual([]);
    const rows = Array.from({ length: 100 }, () => ({ Population: 'x' }));
    expect(mismatches({ rows, count: 1 }, schema)).toHaveLength(5);
  });
});

describe('a run held to its output.js', () => {
  const runtime = (produces: Record<string, unknown>) => quietRuntime({ code: { run: async () => produces } });
  const graphWith = (definition: string | undefined) => parseGraph({
    metadata: { name: 't' },
    nodes: [{
      id: 'count', node_type: 'code', label: 'Count',
      inputs: [{ id: 'text', name: 'Text', kind: 'input', data_type: 'any', multi: true }],
      outputs: [{ id: 'total', name: 'Total', kind: 'output', data_type: 'any', multi: true }],
      config: { code: 'function run() {}', batch_mode: 'whole_list', ...(definition ? { output_definition: definition } : {}) },
    }],
    edges: [],
  });

  it('says so on the node when what comes out does not fit, and still runs; says nothing when it fits or there is no output.js', async () => {
    const result = await executeGraph(graphWith('module.exports = { "total": 7 };'), { runtime: runtime({ total: 'seven' }), registry });
    const count = result.node_results[0];
    expect(count.status).toBe('success');
    expect(count.outputs).toEqual({ total: 'seven' });
    expect(count.messages).toEqual(['Does not fit its output.js: output "total" is text; output.js says a number']);

    const fits = await executeGraph(graphWith('module.exports = { "total": 7 };'), { runtime: runtime({ total: 9 }), registry });
    expect(fits.node_results[0].messages).toBeUndefined();
    const none = await executeGraph(graphWith(undefined), { runtime: runtime({ total: 'anything' }), registry });
    expect(none.node_results[0].messages).toBeUndefined();
  });
});
