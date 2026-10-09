import { beforeEach, describe, expect, it } from 'vitest';
import type { GraphEdge, GraphNode, Port } from '../graph';
import { useGraphStore } from './graphStore';
import { trackPorts } from './portRenames';
import { saveDraft } from '../../graph-editor/node/nodeDraft';
import { baseNodeConfig } from '../document/baseNodeConfig';

/**
 * The node panel, written into the graph: which wire ends up on which port.
 *
 * A port's id is the name a body reads it by -- `inputs.csv`, `{ figure }` --
 * so the ports editor edits exactly that, and a rename must not cut the wire
 * on it. The edits below are the ones the ports editor makes (`PortsEditor`):
 * a row is edited by spreading it with the change, removed by filtering it
 * out. Each test edits a draft that way, writes it the way the panel does
 * (`saveDraft`), and looks at the wires.
 */
const edit = (ports: Port[], at: number, patch: Partial<Port>) => ports.map((port, i) => (i === at ? { ...port, ...patch } : port));
const remove = (ports: Port[], at: number) => ports.filter((_, i) => i !== at);

const input = (id: string): Port => ({ id, name: id, kind: 'input', data_type: 'any', multi: false, required: false, description: '' });
const output = (id: string): Port => ({ id, name: id, kind: 'output', data_type: 'any', multi: false, required: false, description: '' });

function node(id: string, inputs: Port[], outputs: Port[] = []): GraphNode {
  return { id, node_type: 'code', label: id, description: '', position: { x: 0, y: 0 }, inputs, outputs, config: baseNodeConfig() };
}

const store = () => useGraphStore.getState();
const stored = (id: string) => store().rfNodes.find((n) => n.id === id)!.data.graphNode as GraphNode;
/** Every wire into *target*, as "source -> port". */
const into = (target: string) => store().rfEdges
  .filter((edge) => edge.target === target)
  .map((edge) => `${edge.source} -> ${edge.targetHandle}`)
  .sort();

/** Open *id* in its panel, change its ports with *change*, and write it. */
function savePanel(id: string, change: (draft: GraphNode) => GraphNode) {
  const draft = change(trackPorts(JSON.parse(JSON.stringify(stored(id)))));
  saveDraft(id, stored(id), draft);
}

const wire = (source: string, target: string, port: string): GraphEdge =>
  ({ id: `${source}-${target}-${port}`, source_node_id: source, source_port_id: 'out', target_node_id: target, target_port_id: port });

/** The graph each test starts from: a and b wired into ai's two inputs. */
function load() {
  store().loadGraph({
    metadata: { name: 'T', description: '', gui_scheme: 'night' },
    nodes: [
      node('a', [], [output('out')]),
      node('b', [], [output('out')]),
      node('ai', [input('prompt'), input('context')], [output('output')]),
    ],
    edges: [wire('a', 'ai', 'prompt'), wire('b', 'ai', 'context')],
  });
}

beforeEach(load);

describe('writing a node\'s panel: the wires follow the ports, not the rows', () => {
  it('takes a removed port\'s wire away, and leaves the port that slid into its row alone -- even when another is renamed to the name just freed', () => {
    savePanel('ai', (draft) => ({ ...draft, inputs: remove(draft.inputs, 0) }));
    expect(stored('ai').inputs.map((port) => port.id)).toEqual(['context']);
    expect(into('ai')).toEqual(['b -> context']);

    // Remove `prompt`, then rename `context` to `prompt` before one Save: by rows this
    // read as "context renamed to prompt", and the port now called prompt got both wires.
    load();
    savePanel('ai', (draft) => ({ ...draft, inputs: edit(remove(draft.inputs, 0), 0, { id: 'prompt' }) }));
    expect(into('ai')).toEqual(['b -> prompt']);
  });

  it('moves the wire of a port that was renamed, at an input or at an output, and names it after its new end', () => {
    savePanel('ai', (draft) => ({ ...draft, inputs: edit(draft.inputs, 0, { id: 'question' }) }));
    expect(into('ai')).toEqual(['a -> question', 'b -> context']);
    expect(store().rfEdges.find((edge) => edge.targetHandle === 'question')?.id).toBe('a.out -> ai.question');

    savePanel('a', (draft) => ({ ...draft, outputs: edit(draft.outputs, 0, { id: 'figure' }) }));
    expect(store().rfEdges.find((edge) => edge.target === 'ai' && edge.targetHandle === 'question')?.sourceHandle).toBe('figure');
  });
});
