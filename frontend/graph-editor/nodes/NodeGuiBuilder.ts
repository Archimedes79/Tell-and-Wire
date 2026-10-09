// A node's build-time half, in the browser: the mirror of `graph/nodes/NodeRunner.ts`.

import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { GraphNode, NodeType } from '../../app/graph';
import { ElementGuiBuilder } from '../../app/elements/ElementGuiBuilder';

/**
 * Which undo step a change made in a node's panel is (`node/nodePanel.ts`).
 * Typing is one step with what was typed into the same field a moment before:
 * the setting's own field, unless `{ field }` names the one typed into. `ONCE`
 * is what is not typing -- a file dropped in, a box ticked, what ✨ wrote --
 * written at once, as a step of its own.
 */
export const ONCE = 'once';
export type UndoStep = typeof ONCE | { field: string };

/**
 * What the node view hands every panel of a node: the node, and the two ways to
 * change it. A panel takes the part it needs.
 *
 * What a panel changes is in the graph a moment later (`node/nodePanel.ts`):
 * there is no Save to wait for. So what cannot be stored yet -- JSON that does
 * not parse, a name another port has -- is not handed on at all: the field
 * keeps it as typed and says why (`useTyped`).
 */
export interface NodePanelProps {
  node: GraphNode;
  /**
   * Sets one setting, as the undo step *step* says (typing into it, by
   * default). *value* may instead be a function of the setting as it is when
   * the change lands: what a write made after a wait -- a run upstream, a
   * file read -- is merged into, so that it does not put back a copy from
   * before the wait over what was typed meanwhile.
   */
  setConfig: (key: string, value: unknown, step?: UndoStep) => void;
  /** Changes the node as a whole, for a setting that is a port and a key at once ("Run once per item"). */
  updateNode: (change: (node: GraphNode) => GraphNode, step?: UndoStep) => void;
}

export type PortEditing = 'edit' | 'fixed' | 'none';

export abstract class NodeGuiBuilder extends ElementGuiBuilder<NodePanelProps> {
  // ── What it is ────────────────────────────────────────────────────────────

  abstract readonly nodeType: NodeType;

  // ── Build time ────────────────────────────────────────────────────────────
  // The editor: the palette, a new element, its panels, what ✨ is told.
  // It travels into a tool with the class, and no tool calls it (`runtime/boundary.test.ts`).

  /** What the palette calls it, and what a new one's heading starts with: "Code 1". */
  abstract readonly label: string;

  /** Shown on hover in the palette: what the node is for, in one line. */
  abstract readonly hint: string;

  /** What a person might write in the node's text: the placeholder of "What it does". */
  abstract readonly example: string;

  /** The node's tint on the canvas: its `NODE` colour (`app/ui/theme.ts`). */
  abstract readonly color: string;

  /** Its icon, on its card and in the palette: with `ink`, what tells one kind from another at a glance. */
  abstract readonly icon: LucideIcon;

  /** Its colour as ink on a surface: the icon on its card, the chip in the palette (`INK`, `app/ui/theme.ts`). */
  abstract readonly ink: string;

  /**
   * The heading the node palette offers it under -- "Processing" -- or none,
   * for a kind it does not offer. The palette's headings are these, in the
   * registry's order: a kind added is offered without a line in a table of
   * the palette's own.
   */
  readonly paletteGroup?: string;

  /**
   * The settings most people never touch -- once per item, catching failures,
   * the model --, drawn in the node's settings after its ports, where the node
   * has ports to edit: opening a node shows what it *does*, not a form.
   */
  readonly AdvancedPanel?: ComponentType<NodePanelProps>;

  /**
   * A node that says what its ports carry in its definitions (input.js,
   * output.js): a code or an ai node. Its ports are edited in its settings,
   * without a type per port -- an input's follows its wire -- and
   * its outputs follow its output definition.
   */
  readonly definesItself: boolean = false;

  /**
   * How much of each side's ports is the person's to change.
   * `edit`: add, remove, rename, type. `fixed`: the node reads them by name,
   * so they are shown and not changed. `none`: the side is not shown; the
   * node has no such ports. Only asked where the ports are not derived (`derivedNodePorts`).
   */
  readonly portEditing: { inputs: PortEditing; outputs: PortEditing } = { inputs: 'edit', outputs: 'edit' };

  /** One line under each side of the port list: how the node's body sees them. */
  portHint(_side: 'inputs' | 'outputs', _node: GraphNode): string | undefined {
    return undefined;
  }

  /**
   * What this node hands on, in words, for the nodes it feeds: their ✨ is
   * told it beside the wire. Nothing by default; a node whose output
   * definition says it, or whose kind does, says that. *port*: the output the
   * wire leaves from, for a node whose outputs hand on different things.
   */
  describeOutput(_node: GraphNode, _port?: string): string {
    return '';
  }

  /**
   * What a file dropped on the node on the canvas gives it, or undefined where
   * a drop means nothing to it: a code or an ai node takes the file as its
   * example file (by *path*), a data node what the file says (*text*), as what
   * it holds. Only the one that is used is asked for.
   */
  dropPort(_node: GraphNode): 'path' | 'text' | undefined {
    return undefined;
  }

  /** *node* holding *value* from a file dropped on it: see `dropPort`. */
  withDropped(node: GraphNode, _value: unknown): GraphNode {
    return node;
  }

  /** A line of what the node holds, shown on the canvas under its ports. Nothing, for most. */
  canvasSummary?(node: GraphNode): string | undefined;

  /**
   * The node is a source whose data nothing describes yet -- no file or
   * folder to read -- so a generation sweep would be written against a guess.
   * `fed`: something upstream feeds it.
   */
  missingExample(_node: GraphNode, _fed: boolean): boolean {
    return false;
  }

  /**
   * What this node hands on from one output port without running anything --
   * what a data node stores -- or undefined: where a node wired to it finds
   * the file its example is taken from before the graph has ever run.
   */
  restingValue(_node: GraphNode, _port: string): unknown {
    return undefined;
  }

  /**
   * What this node wants on one of its input ports, in words, for a node
   * wired into it: its ✨ is told, beside the output that feeds it. The
   * port's own description by default; a node whose port wants something
   * more particular -- a chart block, what a data node stores -- says that.
   */
  wantsOn(node: GraphNode, port: string): string | undefined {
    return node.inputs.find((p) => p.id === port)?.description?.trim() || undefined;
  }

}
