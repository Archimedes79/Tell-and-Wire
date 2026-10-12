import { describe, it, expect } from 'vitest';
import { runners } from '../registry.ts';
import { DataNodeDefinition } from '../../../../../graph/nodes/data/DataNodeDefinition.ts';
import { quietRuntime } from '../../test/fakes.ts';
import type { GraphNode } from '../../../../../graph/graph.ts';

function dataNode(value: unknown, more: Record<string, unknown> = {}): GraphNode {
  return {
    id: 'store', node_type: 'data', label: 'Store', description: '',
    position: { x: 0, y: 0 }, inputs: [], outputs: [], config: { data_value: value, ...more },
  } as unknown as GraphNode;
}

const nowhere = quietRuntime();
const element = new DataNodeDefinition();
const runner = runners.node('data')!;

describe('a data node', () => {
  it('is a struct: a port in and out for each field and no other; it fills from what arrives and forwards the struct; what arrives is kept field by field when the round is over', async () => {
    // Its ports follow its fields; what is no object has none.
    expect(element.derivedPorts(dataNode({ recent: [], seen: 0 }))).toMatchObject({
      inputs: [{ id: 'recent' }, { id: 'seen' }],
      outputs: [{ id: 'recent' }, { id: 'seen' }],
    });
    expect(element.derivedPorts(dataNode('hello')).inputs).toEqual([]);
    expect(element.derivedPorts(dataNode(null)).outputs).toEqual([]);

    // What arrives on a field replaces it, every other hands on what it kept.
    const held = { recent: ['a'], seen: 1 };
    expect(await runner.execute(dataNode(held), { seen: 2 }, nowhere)).toEqual({ recent: ['a'], seen: 2 });
    expect(await runner.execute(dataNode(held), {}, nowhere)).toEqual({ recent: ['a'], seen: 1 });
    // A field is its own, whatever an object inherits.
    expect(await runner.execute(dataNode({ toString: 'kept' }), {}, nowhere)).toMatchObject({ toString: 'kept' });

    // When the round is over what arrived on a field is kept; what arrives on a port that is no field is nobody's. It starts empty, and holds what the rounds gave it.
    const counter = dataNode({ seen: 0, recent: [] });
    element.settleMemory(counter, 'seen', 2);
    element.settleMemory(counter, 'recent', ['a']);
    element.settleMemory(counter, 'nothing', 3);
    // Each value is kept on its own, and put back on its own: one the design no longer has is nobody's.
    expect(element.state(counter)).toEqual({ seen: 2, recent: ['a'] });
    element.setState(counter, { seen: 0, gone: 1 });
    expect(counter.config.data_value).toEqual({ seen: 0, recent: ['a'] });
    expect(element.holds(counter)).toEqual({ seen: 0, recent: ['a'] });
    // Watched by name: the whole and each field.
    expect(element.offers(counter).map((offer) => [offer.name, offer.part])).toEqual([['store', undefined], ['store.seen', 'seen'], ['store.recent', 'recent']]);

    // The fields are files of their own, as JSON -- how it starts, and how it looks filled: that is the fields where none is written.
    expect(element.texts()).toEqual([
      { field: 'data_value', file: 'data.json', json: true, standard: '{}' },
      { field: 'data_example', file: 'example.json', json: true, standard: '{}' },
      { field: 'history', file: 'history.md' },
    ]);
    expect(element.config(dataNode({ list: [] })).example).toEqual({ list: [] });
    expect(element.config(dataNode({ list: [] }, { data_example: { list: [1, 2] } })).example).toEqual({ list: [1, 2] });
  });
});
