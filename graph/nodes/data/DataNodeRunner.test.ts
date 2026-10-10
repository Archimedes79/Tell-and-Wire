import { describe, it, expect } from 'vitest';
import { DataNodeRunner } from './DataNodeRunner.ts';
import { quietRuntime } from '../../test/fakes.ts';
import type { GraphNode } from '../../graph.ts';

function dataNode(value: unknown, more: Record<string, unknown> = {}): GraphNode {
  return {
    id: 'store', node_type: 'data', label: 'Store', description: '',
    position: { x: 0, y: 0 }, inputs: [], outputs: [], config: { data_value: value, ...more },
  } as unknown as GraphNode;
}

const nowhere = quietRuntime();
const element = new DataNodeRunner();

describe('a data node', () => {
  it('is a struct: a port in and out for each field, the round count and all; it fills from what arrives and forwards the struct; what arrives is kept field by field when the round is over', async () => {
    // Its ports follow its fields; what is no object has none.
    expect(element.derivedPorts(dataNode({ recent: [], seen: 0 }))).toMatchObject({
      inputs: [{ id: 'recent' }, { id: 'seen' }],
      outputs: [{ id: 'recent' }, { id: 'seen' }, { id: 'round', data_type: 'number' }, { id: 'all', data_type: 'json' }, { id: 'before', data_type: 'json', passive: true }],
    });
    expect(element.derivedPorts(dataNode('hello')).inputs).toEqual([]);
    expect(element.derivedPorts(dataNode(null)).outputs.map((port) => port.id)).toEqual(['round', 'all', 'before']);

    // What arrives on a field replaces it, every other hands on what it kept, and all carries them all and the number of the round; before is how it was.
    const held = { recent: ['a'], seen: 1 };
    expect(await element.execute(dataNode(held), { seen: 2 }, nowhere)).toEqual({ recent: ['a'], seen: 2, round: 1, all: { recent: ['a'], seen: 2, round: 1 }, before: { recent: ['a'], seen: 1, round: 1 } });
    expect(await element.execute(dataNode(held), {}, nowhere)).toEqual({ recent: ['a'], seen: 1, round: 1, all: { recent: ['a'], seen: 1, round: 1 }, before: { recent: ['a'], seen: 1, round: 1 } });
    // A field is its own, whatever an object inherits.
    expect(await element.execute(dataNode({ toString: 'kept' }), {}, nowhere)).toMatchObject({ toString: 'kept' });

    // When the round is over what arrived on a field is kept; what arrives on a port that is no field is nobody's, and nothing writes the count.
    const counter = dataNode({ seen: 1, recent: [] });
    element.settleMemory(counter, 'seen', 2);
    element.settleMemory(counter, 'nothing', 3);
    element.settleMemory(counter, 'round', 9);
    element.endRound(counter);
    // Each value is kept on its own, and put back on its own: one the design no longer has is nobody's.
    expect(element.state(counter)).toEqual({ seen: 2, recent: [], round: 1 });
    element.setState(counter, { seen: 0, round: 5, gone: 1 });
    expect(counter.config.data_value).toEqual({ seen: 0, recent: [] });
    expect(element.holds(counter)).toEqual({ seen: 0, recent: [], round: 5 });
    // Watched by name: the whole, each field and the count.
    expect(element.offers(counter).map((offer) => [offer.name, offer.part])).toEqual([['store', undefined], ['store.seen', 'seen'], ['store.recent', 'recent'], ['store.round', 'round']]);

    // The fields are files of their own, as JSON -- how it starts, and how it looks filled: that is the fields where none is written.
    expect(element.texts()).toEqual([
      { field: 'data_value', file: 'data.json', json: true, standard: '{}' },
      { field: 'data_example', file: 'example.json', json: true, standard: '{}' },
      { field: 'history', file: 'history.md' },
    ]);
    expect(element.config(dataNode({ list: [] })).example).toEqual({ list: [] });
    expect(element.config(dataNode({ list: [] }, { data_example: { list: [1, 2] } })).example).toEqual({ list: [1, 2] });
    // A name a port cannot have is said, so is a file that is no object.
    expect(element.problems(dataNode({ all: 1, 'two words': 2, __run: 3, round: 4, before: 5, fine: 6 }), null, 'Store')).toHaveLength(5);
    expect(element.problems(dataNode('hello'), null, 'Store')).toHaveLength(1);
    expect(element.problems(dataNode({}, { data_example: [1] }), null, 'Store')).toHaveLength(1);
    expect(element.problems(dataNode(null), null, 'Store')).toEqual([]);
  });
});
