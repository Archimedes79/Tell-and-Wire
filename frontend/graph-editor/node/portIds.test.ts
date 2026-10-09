import { describe, expect, it } from 'vitest';
import type { Port } from '../../app/graph';
import { portIdProblems } from './portIds';

const port = (id: string, kind: 'input' | 'output' = 'input'): Port =>
  ({ id, name: id, kind, data_type: 'any', multi: false, required: false, description: '' });
const outputs = (...ids: string[]) => ids.map((id) => port(id, 'output'));

describe('the names a node panel saves its ports under', () => {
  it('will not save two ports of one name, which merged their wires into one value, nor a port with no name', () => {
    expect(portIdProblems([port('a'), port('a')], [], false).inputs).not.toBe('');
    expect(portIdProblems([], outputs('out', 'out'), false).outputs).not.toBe('');
    expect(portIdProblems([port('')], [], false).inputs).not.toBe('');
    expect(portIdProblems([port('a'), port('b')], outputs('out'), false)).toEqual({ inputs: '', outputs: '' });
  });
});
