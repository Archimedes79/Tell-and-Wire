// What a change of the whole graph, said in the bar under the canvas, would
// change -- the part of the bar that is a rule rather than drawing, so a test
// can hold it. A change to one node is said in that node's chats.

import type { Graph, GraphNode, Port } from './graph';
import { baseNodeConfig } from './document/baseNodeConfig';
import { derivedNodePorts } from './document/ports';
import { savedNode } from './document/nodeKinds';
import { wireOf } from '../../backend/app/project/flow.ts';

/** What a change of the whole graph changes: nodes by id, and wires by what they join. */
interface GraphChange {
  added: GraphNode[];
  removed: GraphNode[];
  /** Kept, and different in what they say or hold -- as the change has them. */
  changed: GraphNode[];
  wires: { added: number; removed: number };
}

/**
 * A node as far as a change of it matters to a person: its kind, its words,
 * its ports and the settings that are not their default. Not where it stands,
 * and not a default spelled out or left out -- a model asked to hand the graph
 * back writes some keys a file leaves out, and a node it did not touch is not
 * a node it changed.
 */
function said(node: GraphNode): string {
  const full = { ...node, config: { ...baseNodeConfig(), ...node.config } };
  const ports = derivedNodePorts(full) ?? full;
  const named = (list: Port[]) => list.map((port) => [port.id, port.name, port.data_type, !!port.multi]);
  return JSON.stringify([node.node_type, node.label, node.description ?? '', named(ports.inputs), named(ports.outputs), savedNode(full).config]);
}

/** What *after* changes of *before*: the nodes it adds, removes and changes, and how many wires come and go. */
export function graphChange(before: Graph, after: Graph): GraphChange {
  const was = new Map(before.nodes.map((node) => [node.id, node]));
  const now = new Set(after.nodes.map((node) => node.id));
  const wiresBefore = new Set(before.edges.map(wireOf));
  const wiresAfter = new Set(after.edges.map(wireOf));
  return {
    added: after.nodes.filter((node) => !was.has(node.id)),
    removed: before.nodes.filter((node) => !now.has(node.id)),
    changed: after.nodes.filter((node) => was.has(node.id) && said(was.get(node.id)!) !== said(node)),
    wires: {
      added: [...wiresAfter].filter((wire) => !wiresBefore.has(wire)).length,
      removed: [...wiresBefore].filter((wire) => !wiresAfter.has(wire)).length,
    },
  };
}

/** *change* in a line or two: what it adds, removes and changes -- or that it changes nothing. */
export function describeChange(change: GraphChange): string[] {
  const names = (nodes: GraphNode[]) => nodes.map((node) => node.label || node.id).join(', ');
  const { added, removed } = change.wires;
  const lines = [
    change.added.length ? `Adds ${names(change.added)}.` : '',
    change.removed.length ? `Removes ${names(change.removed)}.` : '',
    change.changed.length ? `Changes ${names(change.changed)}.` : '',
    added || removed ? `Wires: ${added} added, ${removed} removed.` : '',
  ].filter(Boolean);
  return lines.length ? lines : ['Nothing in the graph changes.'];
}
