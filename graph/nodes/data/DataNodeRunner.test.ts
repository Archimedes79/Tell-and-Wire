import { describe, it, expect } from 'vitest';
import { DataNodeRunner } from './DataNodeRunner.ts';
import { quietRuntime } from '../../test/fakes.ts';
import type { GraphNode } from '../../graph.ts';

function dataNode(config: Record<string, unknown>): GraphNode {
  return {
    id: 'store', node_type: 'data', label: 'Store', description: '',
    position: { x: 0, y: 0 }, inputs: [], outputs: [], config,
  };
}

const nowhere = quietRuntime({ files: { exists: async () => false } });
const element = new DataNodeRunner();

describe('a data node', () => {
  it('hands on what it holds -- null for an empty structure, "" for an empty text -- and keeps it in a file of its own', async () => {
    const hands = (config: Record<string, unknown>, inputs = {}) => element.execute(dataNode(config), inputs, nowhere);
    expect(await hands({ data_format: 'structure', data_value: [1, 2] })).toEqual({ output: [1, 2] });
    expect(await hands({ data_format: 'structure', data_value: null }, { input: [3] })).toEqual({ output: [3] });
    // Handed on as "" a cleared structure would be text, and the node after it would call .push on it.
    expect(await hands({ data_format: 'structure', data_value: null })).toEqual({ output: null });
    expect(await hands({ data_format: 'text', data_value: null })).toEqual({ output: '' });
    expect(await hands({})).toEqual({ output: '' });

    // It keeps its value in a file of its own, as JSON where it holds structure, and holds structure once a run hands it a number.
    expect(element.texts(dataNode({ data_format: 'structure', data_value: { count: 2 } }))).toEqual([
      { field: 'data_value', file: 'data.json', json: true, standard: 'null' },
      { field: 'history', file: 'history.md' },
    ]);
    const counter = dataNode({ data_format: 'text', data_value: '' });
    element.settleMemory(counter, 'input', 'one');
    expect(counter.config).toMatchObject({ data_format: 'text', data_value: 'one' });
    element.settleMemory(counter, 'input', 1);
    expect(counter.config).toMatchObject({ data_format: 'structure', data_value: 1 });
  });
});
