import { lazy } from 'react';
import type { GraphNode } from '../../../app/graph';
import { SubgraphNodeRunner } from '../../../../graph/nodes/subgraph/SubgraphNodeRunner.ts';
import { registry as runnerRegistry } from '../../../../graph/nodes/registry.ts';
import { INK, NODE } from '../../../app/ui/theme';
import { NodeGuiBuilder } from '../NodeGuiBuilder';
import { Boxes } from 'lucide-react';

const ELEMENT = new SubgraphNodeRunner();

/**
 * A node that holds a graph.
 *
 * Its ports are the graph inside it: a start point in there is a port here, an
 * end point in there is a port here. So there is nothing to edit on this
 * node itself -- the panel is a way in, and what it lists it lists by asking
 * its runner the same question the canvas asks.
 */
export class SubgraphNodeGuiBuilder extends NodeGuiBuilder {
  readonly nodeType = 'subgraph';

  // ── Build time ────────────────────────────────────────────────────────────

  readonly label = 'Subgraph';

  readonly hint = 'A graph inside a node: build a part of the work on its own canvas';

  readonly example = 'e.g. Take a paper, and give back a one-paragraph summary and a verdict';

  readonly color = NODE.subgraph;

  /** Its icon, on its card and in the palette. */
  readonly icon = Boxes;

  /** Its colour as ink on a surface: the icon on its card, the chip in the palette (`INK`). */
  readonly ink = INK.subgraph;

  // A graph of its own, one node wide from out here: the way a graph grows
  // in depth rather than in width.
  override readonly paletteGroup = 'Structure';

  override readonly Panel = lazy(() => import('./SubgraphNodePanel'));

  override readonly AdvancedPanel = lazy(() => import('./SubgraphNodeAdvancedPanel'));

  override describeOutput(node: GraphNode): string {
    const ports = ELEMENT.derivedPorts(node as never, runnerRegistry)?.outputs ?? [];
    return ports.length
      ? `Whatever the graph inside puts on: ${ports.map((port) => port.name).join(', ')}.`
      : 'Nothing yet: the graph inside has no end point.';
  }
}
