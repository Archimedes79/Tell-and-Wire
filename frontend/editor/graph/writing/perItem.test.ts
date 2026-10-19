import { describe, it, expect } from 'vitest';
import type { GraphNode, GuiWidget, Wire } from '../../document/graph';
import { listPorts } from './perItem';

describe('the ports a list arrives on', () => {
  const taker = {
    id: 'each', node_type: 'ai', label: 'Each', description: '', position: { x: 0, y: 0 }, outputs: [], config: {},
    inputs: [{ id: 'story', name: 'story', kind: 'input', data_type: 'file_path', multi: false, required: false, description: '', field: 'folder' }],
  } as unknown as GraphNode;
  const wire = { id: 'w', source: 'start', sourceHandle: 'data', target: 'each', targetHandle: 'story' } as unknown as Wire;
  const picker = (mode: string) => ({ id: 'folder', kind: 'input_picker', label: 'Folder', mode, sends_to: ['start'] }) as unknown as GuiWidget;

  it('include one that takes of a start point the value of a block that sends a list -- a folder to choose -- and not one that takes a single file', () => {
    expect(listPorts(taker, undefined, [], [wire], [picker('directory')])).toEqual(['story']);
    expect(listPorts(taker, undefined, [], [wire], [picker('file')])).toEqual([]);
    // Wired from nothing, there is no list on its way.
    expect(listPorts(taker, undefined, [], [], [picker('directory')])).toEqual([]);
  });
});
