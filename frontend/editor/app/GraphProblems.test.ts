import { describe, expect, it } from 'vitest';
import { placeOf, problemsOf } from './GraphProblems';

describe('where a problem is said to be', () => {
  const graph = { nodes: [{ id: 'code', label: 'Add one' }, { id: 'data', label: '' }] } as Parameters<typeof placeOf>[1];

  it('names a node by the heading on its card, not by its id', () => {
    expect(placeOf('node "code"', graph)).toBe('“Add one”');
    expect(placeOf('node "code", output.js', graph)).toBe('“Add one”, output.js');
  });

  it('names only the node of the top graph, never one inside a node, whose id another card may share', () => {
    expect(placeOf('node "code", node "data"', graph)).toBe('“Add one”, node "data"');
    expect(placeOf('node "data", node "code"', graph)).toBe('node "data", node "code"');
  });

  it('leaves what it cannot name as it was: a node with no heading, one that is gone, an edge', () => {
    expect(placeOf('node "data"', graph)).toBe('node "data"');
    expect(placeOf('node "ghost"', graph)).toBe('node "ghost"');
    expect(placeOf('edge "e1"', graph)).toBe('edge "e1"');
  });
});

describe('what is said of a graph with a common problem', () => {
  it('says it in plain words first -- an input nothing is wired to, a graph with no end point', () => {
    const input = { id: 'text', name: 'Text', kind: 'input', data_type: 'text', multi: false, required: false, field: 'file.content' };
    const problems = problemsOf({
      metadata: { name: 't', description: '', gui_scheme: 'night' },
      nodes: [{ id: 'sum', node_type: 'ai', label: 'Sum', description: '', position: { x: 0, y: 0 }, inputs: [input], outputs: [], config: {} }],
      edges: [],
    } as never);
    expect(problems.find((one) => one.problem.includes('nothing is wired to it'))?.plain).toContain('nothing is connected to it');
    expect(problems.find((one) => one.problem.startsWith('Nothing a person can see'))?.plain).toContain('no End point');
  });
});
