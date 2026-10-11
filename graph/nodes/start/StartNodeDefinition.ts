import { NodeDefinition, type Offer, type StartedBy } from '../NodeDefinition.ts';
import type { GraphNode } from '../../graph.ts';
import { port } from '../port.ts';
import { START_PORT } from '../../triggers.ts';

export interface StartConfig {
  /**
   * Who starts it: the gui -- a block's event, which makes the graph one that
   * needs a gui --, a call from outside -- a script, a model over MCP, the
   * graph above --, or the graph itself, when the tool starts and on a clock.
   */
  startedBy: StartedBy;
  /** Started by itself: once when the tool starts, without waiting to be asked. */
  onStart: boolean;
  /** Started by itself: again this often, `45`, `30s`, `5m`, `2h`, `1d`. Empty means never. */
  every: string;
  /**
   * Started by itself: what it sends, as a picker block on a gui sends what
   * was chosen -- one file (its path and content), the files of a folder, or
   * nothing. The graph is then its own sender.
   */
  reads: 'file' | 'folder' | '';
  /** What it reads: the file or the folder. */
  path: string;
  /** A folder: its subfolders too, and only the file types named, `.csv, .txt`. */
  recursive: boolean;
  extensions: string;
  /** What it was last sent: the values of the round it last began. */
  values: unknown;
}

/**
 * Who a package says sent it when no block of the gui did: the gui as a
 * whole (a run of everything), a call, the graph itself, the graph above, or
 * a run nobody named. A block is named by its id, so no block may have one
 * of these (`guiProblems`).
 */
export const SENDERS = ['gui', 'call', 'itself', 'graph', 'run'] as const;

/** What a start point hands on: the event this round began with, if it began here, and what was sent with it. */
export interface Package {
  /** The event, in a round this start point began -- null in any other, where `values` are what it was sent last. `by`: a block's id, or one of `SENDERS`. */
  event: { name: string; by: string } | null;
  /** What the sender sent, as the sender named it: a gui's blocks by id, a script's own names, the graph above under the start point's own. */
  values: unknown;
}

const STARTED_BY: readonly StartedBy[] = ['gui', 'call', 'itself'];

/**
 * Where a round begins: a named start point of the graph.
 *
 * The graph owns it -- its name, and what it runs, which is what it is wired
 * to. Whoever starts it owns what it is started with: a gui sends what its
 * blocks hold, a script sends values of its own, the graph above hands down
 * the value on the wire. None of that is declared here. What arrives is one
 * package, `{event, values}`, on one port, and the first node it is wired to
 * reads out of it what it needs -- an AI node reads it whole, a code node's
 * code picks the values it wants. A field added to what a gui sends changes
 * the package, never the wiring.
 *
 * It is an event like a button's was: wired into a node's ◆, it opens it in
 * the round it began; and a round it did not begin finds it holding what it
 * was sent last, with no event -- what a clock's round reads of the gui.
 */
export class StartNodeDefinition extends NodeDefinition<StartConfig> {
  readonly nodeType = 'start' as const;

  config(node: GraphNode): StartConfig {
    const c = node.config;
    const startedBy = STARTED_BY.includes(c.started_by as StartedBy) ? c.started_by as StartedBy : 'gui';
    const itself = startedBy === 'itself';
    return {
      startedBy,
      onStart: itself && c.on_start !== false,
      every: itself ? String(c.every ?? '').trim() : '',
      reads: itself && (c.reads === 'file' || c.reads === 'folder') ? c.reads : '',
      path: String(c.path ?? '').trim(),
      recursive: c.recursive === true,
      extensions: String(c.extensions ?? ''),
      values: c.values ?? {},
    };
  }

  override derivedPorts() {
    return {
      inputs: [],
      outputs: [port(START_PORT, 'Data', 'output', 'json', false,
        'What the round was started with: {event, values} -- event is null in a round this start point did not begin.')],
    };
  }

  /** Handed down from the graph above, unless the graph starts it itself: then nobody above can. */
  override boundaryRole(node: GraphNode): 'in' | null {
    return this.config(node).startedBy === 'itself' ? null : 'in';
  }

  /**
   * What the graph above hands down is what it sends: the package, with the
   * value on the wire into this start point's port under the start point's
   * name -- as a block sends under its id, and a caller under names of its
   * own. A node in here takes it by that name (`"field"`).
   */
  override answerWith(node: GraphNode, value: unknown): Record<string, unknown> {
    const sent: Package = { event: { name: node.id, by: 'graph' }, values: { [node.id]: value ?? null } };
    return { [START_PORT]: sent };
  }

  override eventPorts(): string[] {
    return [START_PORT];
  }

  override trigger(node: GraphNode) {
    const { startedBy, onStart, every } = this.config(node);
    return startedBy === 'itself' ? { on_start: onStart, every } : null;
  }

  override startedBy(node: GraphNode): StartedBy {
    return this.config(node).startedBy;
  }

  /** An event under its own id, and how it is started: by the gui, by a call, by itself. */
  override offers(node: GraphNode): Offer[] {
    return [{
      kind: 'event', name: node.id, label: node.label || node.id, type: 'json', port: START_PORT,
      startedBy: this.config(node).startedBy,
      ...(node.description ? { description: node.description } : {}),
    }];
  }

  override readonly takesPackage = true;

  override startWith(node: GraphNode, sent: { by: string; values: unknown }): void {
    node.config.values = sent.values ?? {};
    node.config.fired_by = sent.by;
  }

  override lastSent(node: GraphNode): unknown {
    return this.config(node).values;
  }

  /** It keeps time when it starts itself on a clock: what a graph inside a node cannot do. */
  override keepsTime(node: GraphNode): boolean {
    return this.config(node).every !== '';
  }

  /** What it was sent last: the values a round it did not begin still reads -- nothing, until somebody sends some. */
  override state(node: GraphNode): Record<string, unknown> {
    return { values: node.config.values ?? {} };
  }

  override setState(node: GraphNode, kept: Record<string, unknown>): void {
    if (!('values' in kept)) return;
    if (kept.values === null) delete node.config.values;
    else node.config.values = kept.values;
  }
}
