import { NodeRunner, type Offer, type TextFile, type WhatRuns } from '../NodeRunner.ts';
import { type Runtime } from '../Runtime.ts';
import { port } from '../port.ts';
import type { GraphNode } from '../../graph.ts';
import type { Generation } from '../../authoring/generation.ts';
import type { Problem } from '../../execution/wiring.ts';
import { RUN_PORT } from '../../execution/triggers.ts';

export interface DataConfig {
  /** What it holds between rounds: each field, by its name. */
  fields: Record<string, unknown>;
  /** The struct as it looks once rounds have filled it, to write against: the fields as they start where no example is written. */
  example: Record<string, unknown>;
  /** How many rounds it has been through. */
  round: number;
}

/** The output that carries every field at once, and the round count with them. */
export const ALL_FIELDS = 'all';

/** The output that counts the rounds the struct has been through, the one it is in included: the struct's own, no field's. */
export const ROUND = 'round';

/** The passive output: every field and the round number as they were when the round began -- what a loop reads. */
export const BEFORE = 'before';

/** What no field may be called: each is a port of the node's own. */
const RESERVED: readonly string[] = [ALL_FIELDS, ROUND, BEFORE, RUN_PORT];

/** Whether *fields* has a field called *name* of its own: an object also has `constructor`, `toString` and the like, and a port named so is no field. */
export const hasField = (fields: object, name: string): boolean => Object.prototype.hasOwnProperty.call(fields, name);

/** Whether *held* is what `data_value` is: an object, each key a field. */
const isStruct = (held: unknown): held is Record<string, unknown> => !!held && typeof held === 'object' && !Array.isArray(held);

/** What *node* holds, as a struct: `data_value` is an object, and each key is a field. Anything else is a struct of no field (`problems`). */
function fieldsOf(node: Pick<GraphNode, 'config'>): Record<string, unknown> {
  const held = node.config.data_value;
  return isStruct(held) ? held : {};
}

/** The names of its fields: each is an input and an output. */
const namesOf = (node: Pick<GraphNode, 'config'>): string[] => Object.keys(fieldsOf(node)).filter((name) => !RESERVED.includes(name));

/** What the struct looks like filled, as written in example.json -- the fields as they start while nothing is. */
function exampleOf(node: Pick<GraphNode, 'config'>): Record<string, unknown> {
  const held = node.config.data_example;
  return isStruct(held) && Object.keys(held).length ? held : fieldsOf(node);
}

/** How many rounds it has been through, the ones that have ended. */
function roundOf(node: Pick<GraphNode, 'config'>): number {
  const held = node.config.data_round;
  return typeof held === 'number' && held > 0 ? held : 0;
}

/**
 * A struct that lives between rounds: the graph's memory.
 *
 * It holds fields -- their names and their starting values in one file of its
 * own, data.json, an object -- and each field is an input and an output of the
 * node, under its name. Besides one output for each field there is `round`,
 * which counts the rounds, the one it is in included, `all`, which carries
 * the whole struct with it, and `before`, the one passive output. The ports follow the file: what it
 * holds is the node's interface, and the Fields chat writes it from the node's
 * text -- with a second file, example.json, what the struct looks like once
 * rounds have filled it, so what is wired to it is written against more than
 * the empty start.
 *
 * It fills, then forwards: what arrives on a field replaces its value, and the
 * struct as it is then goes on to whatever reads it in the same round -- a
 * field nothing arrived on hands on what it kept. Its `before` is passive:
 * a wire from it orders nothing and carries what it held when the round
 * began, so a node that reads the memory and writes it back takes its
 * `before`: the loop reads the last round and writes this one. Whoever reads
 * it from outside -- a page, a script -- reads what the last round left
 * (`holds`), never a round half done.
 *
 * There is no code in it. Working out a new value -- a count plus one, the
 * last three -- is a code node: it reads a field's output and writes its input.
 * The loop closes through `before` (`passiveWires`).
 */
export class DataNodeRunner extends NodeRunner<DataConfig> {
  readonly nodeType = 'data' as const;

  /** The fields as they start and as they look filled, as JSON -- an empty struct from the start -- and every exchange with the model about them. */
  override texts(): readonly TextFile[] {
    return [
      { field: 'data_value', file: 'data.json', json: true, standard: '{}' },
      { field: 'data_example', file: 'example.json', json: true, standard: '{}' },
      { field: 'history', file: 'history.md' },
    ];
  }

  config(node: GraphNode): DataConfig {
    return { fields: fieldsOf(node), example: exampleOf(node), round: roundOf(node) };
  }

  /** One input and one output for each field, the round count and `all`: the ports follow what the node holds. */
  override derivedPorts(node: GraphNode) {
    const names = namesOf(node);
    return {
      inputs: names.map((name) => port(name, name, 'input', 'any', false, `Replaces "${name}" when something arrives`)),
      outputs: [
        ...names.map((name) => port(name, name, 'output', 'any', false, `"${name}", as it holds when it is read: what arrived this round, or else what it kept`)),
        port(ROUND, 'Round', 'output', 'number', false, 'The number of the round, from 1'),
        port(ALL_FIELDS, 'All', 'output', 'json', false, 'Every field and the round count, as one object'),
        { ...port(BEFORE, 'Before', 'output', 'json', false, 'Every field and the round number as they were when the round began. Passive: a wire from it orders nothing and carries no event'), passive: true },
      ],
    };
  }

  override readonly isMemory = true;

  /** Fill, then forward: what arrived on a field replaces it, and the struct as it is then goes on, with the round count. It is kept when the round is over (`settleMemory`). */
  async execute(node: GraphNode, inputs: Record<string, unknown>, _runtime: Runtime) {
    const held = fieldsOf(node);
    const now = { ...held };
    for (const name of namesOf(node)) if (hasField(inputs, name) && inputs[name] !== undefined) now[name] = inputs[name];
    const round = roundOf(node) + 1;
    return { ...now, [ROUND]: round, [ALL_FIELDS]: { ...now, [ROUND]: round }, [BEFORE]: { ...held, [ROUND]: round } };
  }

  /** What arrived on a field is what it holds from now on. What arrives on a port that is no field is nobody's. */
  override settleMemory(node: GraphNode, portId: string, value: unknown): void {
    const held = fieldsOf(node);
    if (hasField(held, portId) && !RESERVED.includes(portId)) node.config.data_value = { ...held, [portId]: value } as never;
  }

  /** One more round behind it. */
  override endRound(node: GraphNode): void {
    node.config.data_round = (roundOf(node) + 1) as never;
  }

  /** Under its id with its whole content, and each part of it -- a field, the round count -- under the id and its name: what a session lets a page or a script watch (`holds`). */
  override offers(node: GraphNode): Offer[] {
    const label = node.label || node.id;
    return [
      {
        kind: 'state', name: node.id, label, type: 'json',
        ...(node.description ? { description: node.description } : {}),
      },
      ...namesOf(node).map((name): Offer => ({ kind: 'state', name: `${node.id}.${name}`, part: name, label: `${label} · ${name}`, type: 'any' })),
      { kind: 'state', name: `${node.id}.${ROUND}`, part: ROUND, label: `${label} · ${ROUND}`, type: 'number' },
    ];
  }

  /** Every field and the round count, as the last round left them: the whole struct. */
  override holds(node: GraphNode): unknown {
    return { ...fieldsOf(node), [ROUND]: roundOf(node) };
  }

  /** What it keeps, value by value: each field as it was given or last written, and the round count. */
  override state(node: GraphNode): Record<string, unknown> {
    return { ...fieldsOf(node), [ROUND]: roundOf(node) };
  }

  /** Put back as it was kept: each value to its field -- one the design no longer has is nobody's. */
  override setState(node: GraphNode, kept: Record<string, unknown>): void {
    const fields = { ...fieldsOf(node) };
    for (const [name, value] of Object.entries(kept)) {
      if (name === ROUND) node.config.data_round = value as never;
      else if (hasField(fields, name)) fields[name] = value;
    }
    node.config.data_value = fields as never;
  }

  // ── Build time ────────────────────────────────────────────────────────────

  override graphAuthorNote(): string {
    return 'a struct kept between rounds: config.data_value is an object, and each of its keys is a field with a JSON value -- a count, a list, a text -- as it starts; '
      + 'config.data_example is the same struct as it looks filled, after some rounds, which what is wired to it is written against. '
      + 'A field keeps its value until something arrives on its input, which replaces it: the node fills, then forwards the struct as it is then, in the same round. '
      + 'In a loop -- a node reads a field and writes it back -- the node takes the field from the passive output "before" (every field as it was when the round began, one object: the input\'s "field" names the one it wants), and writes the new value into the field\'s input; a wire from "before" orders nothing. A wire from a field\'s output waits for the node to be filled, so it cannot be part of a loop. '
      + 'Its ports are DERIVED from the fields, not taken from this document: each field is an input and an output under its name, '
      + `one more output "${ROUND}" counts the rounds from 1, "${ALL_FIELDS}" carries every field and the count as one object, and "${BEFORE}" is the passive one -- for a field "count": input "count"; outputs "count", "${ROUND}", "${ALL_FIELDS}" and "${BEFORE}". `
      + 'Its description says in words what it holds: the nodes wired to it are generated against that and its fields. '
      + 'It has no code: working out a new value (a count plus one) is a code node that reads the field through "before" and writes the field\'s input: '
      + 'an edge from "before" to an input of the code node, whose "field" names a key of it -- a field of the memory, such as "count", never a node\'s id -- and an edge from the code node\'s output to the field\'s input. '
      + 'The start point or button that makes it happen is wired to that code node\'s ◆, not to the memory; what shows the new value is wired from the field\'s output.';
  }

  /** The fields as they start and as they look filled, written from its text and from what feeds it and what it feeds. */
  override generation(): Generation {
    return { kind: 'data', fields: { body: 'data_value', example: 'data_example' } };
  }

  override whatRuns(): WhatRuns {
    return this.graphRuns('Fills its fields from what arrives on them and hands each on -- a field nothing arrived on, what it kept -- with the round count, and all of them together as "all"; what arrived is kept for the next round.');
  }

  /** It holds one object; a field is a port, named with letters, digits and underscores -- not a name of the node's own: `all`, `round`, the gate's. */
  override problems(node: GraphNode, _elements: unknown, where: string): Problem[] {
    const held = node.config.data_value;
    if (held !== undefined && held !== null && !isStruct(held)) {
      return [{ where, problem: 'data.json is not one JSON object: each key of it is a field.', fix: 'Write the fields as one object, such as {"count": 0}.' }];
    }
    const example = node.config.data_example;
    if (example !== undefined && example !== null && !isStruct(example)) {
      return [{ where, problem: 'example.json is not one JSON object: it is the struct as it looks filled.', fix: 'Write it as one object with the fields of data.json.' }];
    }
    return Object.keys(fieldsOf(node)).flatMap((name): Problem[] => {
      if (name === ALL_FIELDS) return [{ where, problem: 'A field is called "all", which is the output that carries every field.', fix: 'Rename it in data.json.' }];
      if (name === ROUND) return [{ where, problem: 'A field is called "round", which is the output that counts the rounds.', fix: 'Rename it in data.json.' }];
      if (name === BEFORE) return [{ where, problem: 'A field is called "before", which is the passive output that carries every field as it was.', fix: 'Rename it in data.json.' }];
      if (name === RUN_PORT) return [{ where, problem: `A field is called "${RUN_PORT}", which is the name of the gate every node has.`, fix: 'Rename it in data.json.' }];
      if (/^\w+$/.test(name)) return [];
      return [{ where, problem: `A field is called "${name}": a field is a port, named with letters, digits and underscores.`, fix: 'Rename it in data.json.' }];
    });
  }
}
