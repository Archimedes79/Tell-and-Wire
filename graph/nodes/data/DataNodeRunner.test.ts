import { describe, it, expect } from 'vitest';
import { DataNodeRunner } from './DataNodeRunner.ts';
import { quietRuntime } from '../../test/fakes.ts';
import type { GraphNode } from '../../graph.ts';

function dataNode(value: unknown): GraphNode {
  return {
    id: 'store', node_type: 'data', label: 'Store', description: '',
    position: { x: 0, y: 0 }, inputs: [], outputs: [], config: { data_value: value },
  } as unknown as GraphNode;
}

const nowhere = quietRuntime({ files: { exists: async () => false } });
const element = new DataNodeRunner();

describe('a data node', () => {
  it('is a struct: a port in and out for each field and one for all, what arrives replaces a field and what does not leaves it, and it is kept in data.json', async () => {
    // Its ports follow its fields; what is no object has none.
    expect(element.derivedPorts(dataNode({ recent: [], seen: 0 }))).toMatchObject({
      inputs: [{ id: 'recent' }, { id: 'seen' }],
      outputs: [{ id: 'recent' }, { id: 'seen' }, { id: 'all', data_type: 'json' }],
    });
    expect(element.derivedPorts(dataNode('hello')).inputs).toEqual([]);
    expect(element.derivedPorts(dataNode(null)).outputs.map((port) => port.id)).toEqual(['all']);

    // What arrives on a field replaces it, every other hands on what it kept, and all carries them all.
    const held = { recent: ['a'], seen: 1 };
    expect(await element.execute(dataNode(held), { seen: 2 }, nowhere)).toEqual({ recent: ['a'], seen: 2, all: { recent: ['a'], seen: 2 } });
    expect(await element.execute(dataNode(held), {}, nowhere)).toEqual({ recent: ['a'], seen: 1, all: held });
    // A field is its own, whatever an object inherits.
    expect(await element.execute(dataNode({ toString: 'kept' }), {}, nowhere)).toMatchObject({ toString: 'kept' });

    // It keeps what arrives for the next round field by field; what arrives on a port that is no field is nobody's.
    const counter = dataNode({ seen: 1, recent: [] });
    element.settleMemory(counter, 'seen', 2);
    element.settleMemory(counter, 'nothing', 3);
    expect(element.state(counter)).toEqual({ data_value: { seen: 2, recent: [] } });
    element.setState(counter, { data_value: { seen: 0, recent: [] } });
    expect(counter.config.data_value).toEqual({ seen: 0, recent: [] });

    // The fields are a file of its own, as JSON; a name a port cannot have is said, and so is a file that is no object.
    expect(element.texts()).toEqual([
      { field: 'data_value', file: 'data.json', json: true, standard: '{}' },
      { field: 'history', file: 'history.md' },
    ]);
    expect(element.problems(dataNode({ all: 1, 'two words': 2, __run: 3, fine: 4 }), null, 'Store')).toHaveLength(3);
    expect(element.problems(dataNode('hello'), null, 'Store')).toHaveLength(1);
    expect(element.problems(dataNode(null), null, 'Store')).toEqual([]);
  });
});
