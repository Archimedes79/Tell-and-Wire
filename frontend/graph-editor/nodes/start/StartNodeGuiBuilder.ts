import { lazy } from 'react';
import type { GraphNode } from '../../../app/graph';
import { StartNodeRunner } from '../../../../graph/nodes/start/StartNodeRunner.ts';
import { INK, NODE } from '../../../app/ui/theme';
import { NodeGuiBuilder } from '../NodeGuiBuilder';
import { Play } from 'lucide-react';

const ELEMENT = new StartNodeRunner();

/**
 * Where a run begins: a start point, named, started by the page, by a call
 * or by the graph itself -- what it starts is what its "data" is wired to.
 */
export class StartNodeGuiBuilder extends NodeGuiBuilder {
  readonly nodeType = 'start';

  // ── Build time ────────────────────────────────────────────────────────────

  readonly label = 'Start point';

  readonly hint = 'Where a run begins: started by the page, by a call, or by itself -- when the tool starts, on a clock';

  readonly example = 'e.g. The text to summarise, typed on the page';

  readonly color = NODE.start;

  /** Its icon, on its card and in the palette. */
  readonly icon = Play;

  /** Its colour as ink on a surface: the icon on its card, the chip in the palette (`INK`). */
  readonly ink = INK.start;

  override readonly paletteGroup = 'Input';

  override readonly Panel = lazy(() => import('./StartNodePanel'));

  override describeOutput(): string {
    return 'one package, {event, values}: the event when this run began here (null in any other), and the values it was sent, under the sender\'s names';
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
