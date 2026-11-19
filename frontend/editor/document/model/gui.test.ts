import { describe, it, expect } from 'vitest';
import { fieldChoices } from './gui';

describe('what an input wired from a start point can take', () => {
  it('includes the parameters its command line declares, typed as declared, besides what the GUI sends', () => {
    const start = { id: 'say', node_type: 'start', config: { started_by: 'call', params: [{ name: 'text', type: 'text' }, { name: 'words', type: 'number' }, { name: 'loud', type: 'flag' }] } } as never;
    expect(fieldChoices([], start)).toEqual([
      { value: 'text', label: '--text', type: 'text' },
      { value: 'words', label: '--words', type: 'number' },
      { value: 'loud', label: '--loud', type: 'boolean' },
    ]);
  });
});
