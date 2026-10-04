import { lazy } from 'react';
import type { GraphNode } from '../../../app/graph';
import { StartNodeRunner } from '../../../../graph/nodes/start/StartNodeRunner.ts';
import { NodeGuiBuilder } from '../NodeGuiBuilder';

const ELEMENT = new StartNodeRunner();

/**
 * Where a round begins: a start point, named, started by the page, by a call
 * or by the graph itself -- what it starts is what its "data" is wired to.
 */
export class StartNodeGuiBuilder extends NodeGuiBuilder {
  readonly nodeType = 'start';

  // ── Build time ────────────────────────────────────────────────────────────

  readonly label = 'Start point';

  readonly hint = 'Where a round begins: started by the page, by a call, or by itself -- when the tool starts, on a clock';

  readonly icon = '▶️';

  readonly color = 'var(--ui-node-start, #4a3a12)';

  override readonly paletteGroup = 'Input';

  override readonly Panel = lazy(() => import('./StartNodePanel'));

  override describeOutput(): string {
    return 'one package, {event, values}: the event when this round began here (null in any other), and the values it was sent, under the sender\'s names';
  }

  /** Who starts it, under its port: the one thing worth reading without opening it. */
  override canvasSummary(node: GraphNode): string | undefined {
    const { startedBy, onStart, every } = ELEMENT.config(node as never);
    if (startedBy === 'page') return 'started by the page';
    if (startedBy === 'call') return 'started by a call';
    const parts = [onStart ? 'at start' : '', every ? `every ${every}` : ''].filter(Boolean);
    return parts.length ? `by itself: ${parts.join(' · ')}` : 'never';
  }

}
