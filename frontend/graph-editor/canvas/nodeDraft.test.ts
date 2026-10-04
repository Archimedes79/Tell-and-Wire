import { describe, expect, it } from 'vitest';
import type { GraphNode, Port } from '../../app/graph';
import { NODE_KINDS } from '../../app/document/nodeKinds';
import { definitionExample } from '../../../graph/authoring/definition.ts';
import { trackPorts } from '../../app/store/portRenames';
import { withPorts } from './nodeDraft';

/**
 * The node panel's draft, edited the way its ports editor edits it: a row
 * renamed by spreading it with its new id, removed by filtering it out, a new
 * one appended (`PortsEditor`).
 */
const rename = (ports: Port[], at: number, id: string) => ports.map((port, i) => (i === at ? { ...port, id, name: id } : port));
const remove = (ports: Port[], at: number) => ports.filter((_, i) => i !== at);
const fresh = (id: string): Port => ({ id, name: id, kind: 'input', data_type: 'any', multi: false, required: false, description: '' });

/** An input definition of *example*, each key a documented property, as ✨ Input writes one. */
const defined = (example: Record<string, unknown>) => `/**
 * @typedef {Object} Input
${Object.keys(example).map((key) => ` * @property {string} ${key} What arrives on ${key}`).join('\n')}
 */
module.exports = ${JSON.stringify(example, null, 2)};
`;

/** A code node with inputs *ids* and an input definition of *example*, opened in the panel. */
function opened(ids: string[], example: Record<string, unknown>): GraphNode {
  const node = NODE_KINDS.code.create('worker');
  node.inputs = ids.map(fresh);
  node.config.input_definition = defined(example);
  return trackPorts(node);
}

const inputs = (draft: GraphNode) => {
  const read = definitionExample(String(draft.config.input_definition));
  return 'example' in read ? read.example : undefined;
};

describe('the definitions follow the ports they are keyed by', () => {
  it('renames the key with its port, keystroke by keystroke, so ▶ Try hands the body what it reads', () => {
    let draft = opened(['input'], { input: 'a,b' });
    // An empty name, or one another port has, is never handed on: the ports editor keeps it as typed (`portIdProblems`).
    for (const typed of ['inpu', 'c', 'cs', 'csv']) draft = withPorts(draft, { inputs: rename(draft.inputs, 0, typed), outputs: draft.outputs });
    expect(inputs(draft)).toEqual({ csv: 'a,b' });
    // The documented property follows the key.
    expect(String(draft.config.input_definition)).toContain('@property {string} csv What arrives on input');
  });

  it('takes the key and its property away with a removed port, and leaves the port that slid into its row alone', () => {
    let draft = opened(['prompt', 'context'], { prompt: 'p', context: 'c' });
    draft = withPorts(draft, { inputs: remove(draft.inputs, 0), outputs: draft.outputs });
    expect(inputs(draft)).toEqual({ context: 'c' });
    expect(String(draft.config.input_definition)).not.toContain('prompt');
  });
});
