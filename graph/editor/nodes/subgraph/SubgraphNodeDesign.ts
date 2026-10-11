import { NodeDesign, type Designs, type WhatRuns } from '../NodeDesign.ts';
import type { GraphNode } from '../../../graph.ts';
import type { Kinds } from '../../../nodes/NodeDefinition.ts';
import type { Problem } from '../../../wiring.ts';
import { boundaryInputs, boundaryOutputs, carried } from '../../../nodes/subgraph/boundary.ts';
import type { SubgraphNodeDefinition } from '../../../nodes/subgraph/SubgraphNodeDefinition.ts';

export class SubgraphNodeDesign extends NodeDesign<SubgraphNodeDefinition> {
  /** The designs of the nodes inside, which it asks what is wrong where the graph above hands down. */
  private readonly designs: Designs;

  constructor(kind: SubgraphNodeDefinition, designs: Designs) {
    super(kind);
    this.designs = designs;
  }

  override whatRuns(): WhatRuns {
    return this.graphRuns('Runs the graph in its folder, whole, with what arrives on each port sent to the start point of that name, and hands on what reaches its end points.');
  }

  /**
   * What this node's own contract says about the graph it holds.
   *
   * The boundary is this element's idea, so the rules about it live here
   * rather than in the project checker. `check` walks into the graph and
   * checks it as a graph, which is the other half and none of this file's
   * business.
   */
  override problems(node: GraphNode, kinds: Kinds, where: string): Problem[] {
    const held = this.kind.nestedGraph(node);
    if (!held) {
      return [{
        where,
        problem: 'The graph this node holds cannot be read.',
        fix: 'Open its folder and fix its graph-flow.json and graph-nodes.json, or delete the node and build it again.',
      }];
    }

    const found: Problem[] = [];
    const inside = `${where} ▸ `;
    if (!held.nodes.length && node.description.trim()) {
      found.push({
        where,
        problem: 'This part is described and empty: it says what it should do and does nothing.',
        fix: 'Open it and build the graph inside, or delete the node if the plan has changed.',
      });
    }

    for (const inner of held.nodes) {
      if (!kinds.node(inner.node_type)?.keepsTime(inner)) continue;
      found.push({
        where: `${inside}${inner.label || inner.id}`,
        problem: 'A clock inside a graph that a node holds never ticks: only the outermost graph is held by something that keeps time.',
        fix: 'Put a start point on that clock in the outer graph and wire it to this node; in here, let the graph above start it (a call).',
      });
    }

    // The boundary, as one list of names that must not collide: each of these
    // nodes is a port on this one.
    const named = new Map<string, string>();
    for (const boundary of [...boundaryInputs(held, kinds), ...boundaryOutputs(held, kinds)]) {
      const name = boundary.label || boundary.id;
      const other = named.get(name);
      if (other) {
        found.push({
          where: `${inside}node "${boundary.id}"`,
          problem: `It is called "${name}", and so is "${other}": that is two ports of the same name on the node above.`,
          fix: 'Give one of them another label.',
        });
      }
      named.set(name, boundary.id);
    }

    // What each way in says of being handed its value from up here: a start
    // point's example keyed otherwise than this node sends it.
    for (const boundary of boundaryInputs(held, kinds)) {
      found.push(...this.designs.node(boundary.node_type)!.handedDownProblems(boundary, `${inside}node "${boundary.id}"`));
    }

    for (const boundary of boundaryOutputs(held, kinds)) {
      const values = carried(boundary, kinds);
      if (values.length === 1) continue;
      found.push({
        where: `${inside}node "${boundary.id}"`,
        problem: `An end point inside a graph is one port of the node above, carrying one value; this one has ${values.length}.`,
        fix: values.length
          ? `It carries ${values.map((p) => `"${p.id}"`).join(', ')}. Leave it one, and give the others their own end point.`
          : 'Give it an input to carry, or delete it.',
      });
    }

    if (held.gui?.blocks.length) {
      found.push({
        where: `${inside}the gui`,
        problem: 'A gui belongs to the graph at the top; a gui in here would never be shown.',
        fix: 'Move its blocks up onto the gui of the graph at the top, and connect them to the start and end points there.',
      });
    }
    for (const inner of held.nodes) {
      if (kinds.node(inner.node_type)?.startedBy(inner) !== 'gui') continue;
      found.push({
        where: `${inside}${inner.label || inner.id}`,
        problem: 'A start point in here is started by the gui, and a gui belongs to the graph at the top: nothing would start it.',
        fix: 'Let a call start it: the graph above is one, and it starts it through the port of the same name on this node.',
      });
    }
    return found;
  }
}
