import { describe, expect, it } from 'vitest';
import type { GraphNode, Port } from '../../app/graph';
import { NODE_KINDS } from '../../app/document/nodeKinds';
import { ERROR_PORT } from '../../../graph/execution/wiring.ts';
import { portIdsOf, strayDefinition } from './generation';

/** The interface line above an open file: the node's ports as the files name them, and whether input.js and output.js say the same. */
const port = (id: string, kind: Port['kind']): Port => ({ id, name: id, kind, data_type: 'any', multi: false, required: false, description: '' });
const reader = (input: string): GraphNode => ({
  ...NODE_KINDS.code.create('reader'),
  inputs: [port('file', 'input'), port('path', 'input')],
  outputs: [port('text', 'output'), port('info', 'output'), port(ERROR_PORT, 'output')],
  config: { ...NODE_KINDS.code.create('reader').config, input_definition: input },
});

describe('the interface line', () => {
  it('names the ports of each side, without the error port', () => {
    expect(portIdsOf(reader(''), 'input')).toEqual(['file', 'path']);
    expect(portIdsOf(reader(''), 'output')).toEqual(['text', 'info']);
  });

  it('says a definition names other ports than the node has -- and nothing of one that is empty or the same', () => {
    expect(strayDefinition(reader(''), 'input')).toBe(false);
    expect(strayDefinition(reader('module.exports = { "file": "a", "path": "b" };'), 'input')).toBe(false);
    expect(strayDefinition(reader('module.exports = { "file": "a", "name": "b" };'), 'input')).toBe(true);
    expect(strayDefinition(reader('module.exports = { "file": "a" };'), 'input')).toBe(true);
  });
});
