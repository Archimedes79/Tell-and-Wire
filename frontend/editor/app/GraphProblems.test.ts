import { describe, expect, it } from 'vitest';
import { placeOf } from './GraphProblems';

describe('where a problem is said to be', () => {
  const graph = { nodes: [{ id: 'code', label: 'Add one' }, { id: 'data', label: '' }] } as Parameters<typeof placeOf>[1];

  it('names a node by the heading on its card, not by its id', () => {
    expect(placeOf('node "code"', graph)).toBe('“Add one”');
    expect(placeOf('node "code", output.js', graph)).toBe('“Add one”, output.js');
  });

  it('leaves what it cannot name as it was: a node with no heading, one that is gone, an edge', () => {
    expect(placeOf('node "data"', graph)).toBe('node "data"');
    expect(placeOf('node "ghost"', graph)).toBe('node "ghost"');
    expect(placeOf('edge "e1"', graph)).toBe('edge "e1"');
  });
});
