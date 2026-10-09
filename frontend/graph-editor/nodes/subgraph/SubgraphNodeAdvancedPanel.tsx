import { DIMMER, MUTED } from '../../../app/ui/theme';
import { SubgraphNodeRunner } from '../../../../graph/nodes/subgraph/SubgraphNodeRunner.ts';
import { registry as runnerRegistry } from '../../../../graph/nodes/registry.ts';
import { CatchFailures } from '../../fields/RunOptions';
import RunOncePerItem from '../../fields/RunOncePerItem';
import type { NodePanelProps } from '../NodeGuiBuilder';

const ELEMENT = new SubgraphNodeRunner();

/**
 * Its ports, and its settings of its own. The ports are a *view*: the start
 * points and end points of the graph inside, so they are added, renamed and
 * removed in there, with the same palette and the same undo as any other
 * node -- a second way to edit them here would be a second place for them to
 * live. Catching matters more here than elsewhere: anything short of a clean
 * run inside fails this node, so this is how the graph above carries on.
 */
export default function SubgraphNodeAdvancedPanel({ node, setConfig, updateNode }: NodePanelProps) {
  const ports = ELEMENT.derivedPorts(node as never, runnerRegistry) ?? { inputs: [], outputs: [] };
  return (
    <>
      <div>
        <div className="text-xs font-medium mb-1" style={{ color: MUTED }}>Ports — the start and end points inside</div>
        {ports.inputs.length + ports.outputs.length === 0 ? (
          <p className="text-xs" style={{ color: DIMMER }}>None yet: a start point inside is an input here, an end point an output.</p>
        ) : (
          <ul className="text-sm space-y-1">
            {ports.inputs.map((port) => <li key={port.id} style={{ color: MUTED }}>← {port.name}</li>)}
            {ports.outputs.map((port) => <li key={port.id} style={{ color: MUTED }}>→ {port.name}</li>)}
          </ul>
        )}
      </div>
      <RunOncePerItem node={node} updateNode={updateNode} subject="the graph inside" />
      <CatchFailures node={node} setConfig={setConfig} subject="the graph inside" />
    </>
  );
}
