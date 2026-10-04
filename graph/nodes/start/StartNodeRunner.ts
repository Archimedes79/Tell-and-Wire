import { NodeRunner, type Runners, type WhatRuns } from '../NodeRunner.ts';
import type { Runtime } from '../Runtime.ts';
import type { GraphNode } from '../../graph.ts';
import { port } from '../port.ts';
import { names, type Problem } from '../../execution/wiring.ts';
import type { Offer, StartedBy } from '../../../backend/gui-editor/graphInterface.ts';
import { RUN_PORT, START_PORT, parseInterval } from '../../execution/triggers.ts';

export interface StartConfig {
  /**
   * Who starts it: the page -- a block's event, which makes the graph one that
   * needs a page --, a call from outside -- a script, a model over MCP, the
   * graph above --, or the graph itself, when the tool starts and on a clock.
   */
  startedBy: StartedBy;
  /** Started by itself: once when the tool starts, without waiting to be asked. */
  onStart: boolean;
  /** Started by itself: again this often, `45`, `30s`, `5m`, `2h`, `1d`. Empty means never. */
  every: string;
  /** What it was last sent: the values of the round it last began. */
  values: unknown;
}

/**
 * Who a package says sent it when no block of the page did: the page as a
 * whole (a run of everything), a call, the graph itself, the graph above, or
 * a run nobody named. A block is named by its id, so no block may have one
 * of these (`pageProblems`).
 */
export const SENDERS = ['page', 'call', 'itself', 'graph', 'run'] as const;

/** What a start point hands on: the event this round began with, if it began here, and what was sent with it. */
export interface Package {
  /** The event, in a round this start point began -- null in any other, where `values` are what it was sent last. `by`: a block's id, or one of `SENDERS`. */
  event: { name: string; by: string } | null;
  /** What the sender sent, as the sender named it: a page's blocks by id, a script's own names, the graph above under the start point's own. */
  values: unknown;
}

const STARTED_BY: readonly StartedBy[] = ['page', 'call', 'itself'];

/**
 * Where a round begins: a named start point of the graph.
 *
 * The graph owns it -- its name, and what it runs, which is what it is wired
 * to. Whoever starts it owns what it is started with: a page sends what its
 * blocks hold, a script sends values of its own, the graph above hands down
 * the value on the wire. None of that is declared here. What arrives is one
 * package, `{event, values}`, on one port, and the first node it is wired to
 * reads out of it what it needs -- an AI node reads it whole, a code node's
 * code picks the values it wants. A field added to what a page sends changes
 * the package, never the wiring.
 *
 * It is an event like a button's was: wired into a node's ◆, it opens it in
 * the round it began; and a round it did not begin finds it holding what it
 * was sent last, with no event -- what a clock's round reads of the page.
 */
export class StartNodeRunner extends NodeRunner<StartConfig> {
  readonly nodeType = 'start' as const;

  config(node: GraphNode): StartConfig {
    const c = node.config;
    const startedBy = STARTED_BY.includes(c.started_by as StartedBy) ? c.started_by as StartedBy : 'page';
    return {
      startedBy,
      onStart: startedBy === 'itself' && c.on_start !== false,
      every: startedBy === 'itself' ? String(c.every ?? '').trim() : '',
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

  /**
   * What a call sends it for example, held to what the graph above sends: the
   * value under this start point's id (`answerWith`). An example keyed
   * otherwise is what a run of it on its own, and every node written against
   * it, reads -- and the graph above sends none of it: a run from up there
   * handed the inputs nothing, and said nothing.
   */
  override handedDownProblems(node: GraphNode, where: string): Problem[] {
    const { startedBy, values } = this.config(node);
    if (startedBy !== 'call' || !values || typeof values !== 'object' || Array.isArray(values)) return [];
    const keys = Object.keys(values);
    if (!keys.length || keys.includes(node.id)) return [];
    return [{
      where,
      problem: `The graph above sends it its value under "${node.id}", and what a call sends it for example holds ${names(keys)}: `
        + 'an input that takes one of those is handed nothing when the graph above runs this one.',
      fix: `Write the example under "${node.id}" -- {"${node.id}": …} -- and let the inputs wired from it take "${node.id}".`,
    }];
  }

  override eventPorts(): string[] {
    return [START_PORT];
  }

  override startedBy(node: GraphNode): StartedBy {
    return this.config(node).startedBy;
  }

  /** An event under its own id, and how it is started: by the page, by a call, by itself. */
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

  override setState(node: GraphNode, slots: Record<string, unknown>): void {
    if (!('values' in slots)) return;
    if (slots.values === null) delete node.config.values;
    else node.config.values = slots.values;
  }

  async execute(node: GraphNode, _inputs: Record<string, unknown>, runtime: Runtime) {
    const { startedBy, values } = this.config(node);
    const began = runtime.fired?.(START_PORT) ?? true;
    // Who, when nobody said: the graph's own clock, or a run of everything.
    const by = String(node.config.fired_by ?? (startedBy === 'itself' ? 'itself' : 'run'));
    const sent: Package = { event: began ? { name: node.id, by } : null, values };
    return { [START_PORT]: sent };
  }

  // ── Build time ────────────────────────────────────────────────────────────

  override graphAuthorNote(): string {
    return `a named start point: where a round begins. Its id is its name; whoever uses the graph starts it by that name. `
      + `config.started_by is "page" (a block on the page fires it: then the graph needs a page), "call" (a script, a model over MCP, or the graph above starts it) `
      + `or "itself" (config.on_start, true or false: when the tool starts; config.every, "" or "30s", "5m", "2h", "1d": again on that clock). `
      + `Its one output, "${START_PORT}", is DERIVED, not taken from this document: one package {"event": {"name", "by"} or null, "values": {...}}. `
      + `"values" is whatever the sender sent, under the sender's names. Wire "${START_PORT}" into the input of each node that works on it -- an input that takes one value of it says which with `
      + `"field": "<name>" (or a path inside it, "file.content") and is handed that value alone; one without a field is handed the whole package -- or into a node's "${RUN_PORT}" to start that node. `
      + `"event" is null in a round this start point did not begin: "values" are then what it was sent last.`;
  }

  /** A start point the page starts makes a graph one that is used through its page: a bundle carries the page. */
  override deployNeeds(node: GraphNode) {
    return { needsInterface: this.config(node).startedBy === 'page', asksAi: false };
  }

  override whatRuns(): WhatRuns {
    return this.engineRuns('Hands on one package: the event, when this round began here, and the values it was sent -- the last ones, in a round it did not begin.');
  }

  override problems(node: GraphNode, _elements: Runners, where: string): Problem[] {
    const { startedBy, onStart, every } = this.config(node);
    if (startedBy !== 'itself') return [];
    if (every) {
      try {
        parseInterval(every);
      } catch (error) {
        return [{ where, problem: error instanceof Error ? error.message : String(error), fix: 'Write the interval as 45, 30s, 5m, 2h or 1d.' }];
      }
    }
    if (!onStart && !every) {
      return [{ where, problem: 'This start point never starts: it starts itself, but neither when the tool starts nor on a clock.', fix: 'Tick "when the tool starts", give it an interval, or let the page or a call start it.' }];
    }
    return [];
  }
}
