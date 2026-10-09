import { NodeRunner, type Offer, type TextFile, type WhatRuns } from '../NodeRunner.ts';
import { type Runtime } from '../Runtime.ts';
import { port } from '../port.ts';
import type { GraphNode } from '../../graph.ts';
import type { Generation } from '../../authoring/generation.ts';
import type { Problem } from '../../execution/wiring.ts';
import { RUN_PORT } from '../../execution/triggers.ts';

export interface DataConfig {
  /** What it holds between runs: each field, by its name. */
  fields: Record<string, unknown>;
}

/** The output that carries every field at once. */
export const ALL_FIELDS = 'all';

/** Whether *fields* has a field called *name* of its own: an object also has `constructor`, `toString` and the like, and a port named so is no field. */
export const hasField = (fields: object, name: string): boolean => Object.prototype.hasOwnProperty.call(fields, name);

/** Whether *held* is what `data_value` is: an object, each key a field. */
const isStruct = (held: unknown): held is Record<string, unknown> => !!held && typeof held === 'object' && !Array.isArray(held);

/** What *node* holds, as a struct: `data_value` is an object, and each key is a field. Anything else is a struct of no field (`problems`). */
function fieldsOf(node: Pick<GraphNode, 'config'>): Record<string, unknown> {
  const held = node.config.data_value;
  return isStruct(held) ? held : {};
}

/**
 * A struct that lives between runs: the graph's memory.
 *
 * It holds fields -- their names and their starting values in one file of its
 * own, data.json, an object -- and each field is an input and an output of the
 * node, under its name. A field takes what arrives on its input, and keeps its
 * value where nothing does. Besides one output for each field there is `all`,
 * which carries the whole struct. The ports follow the file: what it holds is
 * the node's interface, and the Fields chat writes it from the node's text.
 *
 * There is no code in it. Working out a new value -- a count plus one, the
 * last three -- is a code node: it reads a field's output and writes its input.
 *
 * `isMemory` is what lets an edge back into this node close a loop: the
 * executor leaves that edge out of the ordering and settles the fresh value
 * afterwards, so the next round starts from it. A counter is a node with a
 * field, and a code node adding one.
 *
 * What it holds can be watched without a round: a session lists every
 * struct's whole content by name (`state`, `SessionView.state`).
 */
export class DataNodeRunner extends NodeRunner<DataConfig> {
  readonly nodeType = 'data' as const;

  /** The fields, as JSON -- an empty struct from the start -- and every exchange with the model about them. */
  override texts(): readonly TextFile[] {
    return [
      { field: 'data_value', file: 'data.json', json: true, standard: '{}' },
      { field: 'history', file: 'history.md' },
    ];
  }

  config(node: GraphNode): DataConfig {
    return { fields: fieldsOf(node) };
  }

  /** One input and one output for each field, and `all`: the ports follow what the node holds. */
  override derivedPorts(node: GraphNode) {
    const names = Object.keys(fieldsOf(node));
    return {
      inputs: names.map((name) => port(name, name, 'input', 'any', false, `Replaces "${name}" when something arrives; kept for the next round`)),
      outputs: [
        ...names.map((name) => port(name, name, 'output', 'any', false, `"${name}", as it holds now`)),
        port(ALL_FIELDS, 'All', 'output', 'json', false, 'Every field, as one object'),
      ],
    };
  }

  override readonly isMemory = true;

  async execute(node: GraphNode, inputs: Record<string, unknown>, _runtime: Runtime) {
    // An update arriving this round wins; otherwise a field hands on what it kept.
    const now = { ...fieldsOf(node) };
    for (const name of Object.keys(now)) if (hasField(inputs, name) && inputs[name] !== undefined) now[name] = inputs[name];
    return { ...now, [ALL_FIELDS]: now };
  }

  /** What arrived on a field is what it holds from now on. What arrives on a port that is no field is nobody's. */
  override settleMemory(node: GraphNode, portId: string, value: unknown): void {
    const held = fieldsOf(node);
    if (hasField(held, portId)) node.config.data_value = { ...held, [portId]: value } as never;
  }

  /** Under its id, with its whole content: what a session lets a page or a script watch (`holds`). */
  override offers(node: GraphNode): Offer[] {
    return [{
      kind: 'state', name: node.id, label: node.label || node.id, type: 'json',
      ...(node.description ? { description: node.description } : {}),
    }];
  }

  /** Every field, as it holds them now: the whole struct. */
  override holds(node: GraphNode): unknown {
    return fieldsOf(node);
  }

  /** What it holds: every field, as it was given or as it was last settled. */
  override state(node: GraphNode): Record<string, unknown> {
    return { data_value: fieldsOf(node) };
  }

  /** Put back as it was kept. */
  override setState(node: GraphNode, slots: Record<string, unknown>): void {
    if ('data_value' in slots) node.config.data_value = slots.data_value as never;
  }

  // ── Build time ────────────────────────────────────────────────────────────

  override graphAuthorNote(): string {
    return 'a struct kept between runs: config.data_value is an object, and each of its keys is a field with a JSON value -- a count, a list, a text. '
      + 'A field keeps its value until something arrives on its input, which replaces it and is kept for the next run. '
      + 'Its ports are DERIVED from the fields, not taken from this document: each field is an input and an output under its name, '
      + `and one more output "${ALL_FIELDS}" carries every field as one object -- for a field "count": input "count"; outputs "count" and "${ALL_FIELDS}". `
      + 'Its description says in words what it holds: the nodes wired to it are generated against that and its fields. '
      + 'It has no code: working out a new value is a code node, wired from a field\'s output back to the same field\'s input.';
  }

  /** The fields, written from its text and from what feeds it and what it feeds. */
  override generation(): Generation {
    return { kind: 'data', fields: { body: 'data_value' } };
  }

  override whatRuns(): WhatRuns {
    return this.graphRuns('Hands on each field -- what arrived on it this round, or else what it kept -- and all of them together as "all"; what arrives is kept for the next round.');
  }

  /** It holds one object; a field is a port, named with letters, digits and underscores -- not `all`, the output that carries them all, nor the gate's name. */
  override problems(node: GraphNode, _elements: unknown, where: string): Problem[] {
    const held = node.config.data_value;
    if (held !== undefined && held !== null && !isStruct(held)) {
      return [{ where, problem: 'data.json is not one JSON object: each key of it is a field.', fix: 'Write the fields as one object, such as {"count": 0}.' }];
    }
    return Object.keys(fieldsOf(node)).flatMap((name): Problem[] => {
      if (name === ALL_FIELDS) return [{ where, problem: 'A field is called "all", which is the output that carries every field.', fix: 'Rename it in data.json.' }];
      if (name === RUN_PORT) return [{ where, problem: `A field is called "${RUN_PORT}", which is the name of the gate every node has.`, fix: 'Rename it in data.json.' }];
      if (/^\w+$/.test(name)) return [];
      return [{ where, problem: `A field is called "${name}": a field is a port, named with letters, digits and underscores.`, fix: 'Rename it in data.json.' }];
    });
  }
}
