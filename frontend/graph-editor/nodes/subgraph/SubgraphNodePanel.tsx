import { DANGER_TEXT, DIMMER } from '../../../app/ui/theme';
import Button from '../../../app/ui/Button';
import { useGraphStore } from '../../../app/store/graphStore';
import { roundGoing, useSession } from '../../../app/api/session';
import { SubgraphNodeRunner } from '../../../../graph/nodes/subgraph/SubgraphNodeRunner.ts';
import type { NodePanelProps } from '../NodeGuiBuilder';

const ELEMENT = new SubgraphNodeRunner();

/**
 * In. The panel goes first, because what is behind it is about to be a
 * different graph -- and a panel closed writes what it still holds into the
 * graph it was opened in (`nodePanel.watch`), before the canvas goes in.
 */
export function enterGraphOf(nodeId: string): void {
  const store = useGraphStore.getState();
  store.setEditingNode(null);
  store.openSubgraph(nodeId);
}

/**
 * What there is to say about a node that holds a graph, which is not much: a
 * way in. Its ports, once per item and failures are in Advanced
 * (`SubgraphNodeAdvancedPanel`).
 */
export default function SubgraphNodePanel({ node }: NodePanelProps) {
  // No level opens while a run is going: its result is for the graph on the
  // canvas (`openSubgraph`). Pressed then, the button closed the panel and
  // opened nothing, and said nothing.
  const running = useSession(roundGoing);
  const inner = ELEMENT.nestedGraph(node as never);
  const count = inner?.nodes.length ?? 0;

  // A button that closes the panel and opens nothing is worse than no
  // button: this is the one case it cannot do its job, and it says so.
  if (!inner) {
    return (
      <p className="text-sm" style={{ color: DANGER_TEXT }}>
        The graph this node holds cannot be read. Open its <code>flow.json</code> and <code>nodes.json</code>{' '}
        under the tool&apos;s <code>nodes/</code> folder and fix them, or delete the node and build it again.
      </p>
    );
  }
  return (
    <div>
      <Button
        variant="primary"
        className="w-full"
        onClick={() => enterGraphOf(node.id)}
        disabled={running}
        title={running ? 'A run is going on. The graph inside opens when it is over.' : undefined}
      >
        Open this graph ▸
      </Button>
      <p className="text-xs mt-1" style={{ color: DIMMER }}>
        {count === 0 ? 'The graph inside is empty.' : `The graph inside has ${count} node${count === 1 ? '' : 's'}.`}
      </p>
    </div>
  );
}
