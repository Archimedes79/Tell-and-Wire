import { NodeDefinition, type Offer, type TextFile } from '../NodeDefinition.ts';
import { port } from '../port.ts';
import { isStruct, type GraphNode } from '../../graph.ts';
import { RUN_PORT } from '../../triggers.ts';

interface DataConfig {
  /** What it holds between rounds: each field, by its name. */
  fields: Record<string, unknown>;
  /** The struct as it looks once rounds have filled it, to write against: the fields as they start where no example is written. */
  example: Record<string, unknown>;
}

/** What no field may be called, and what it is instead: a port of the node's own. */
export const RESERVED: Readonly<Record<string, string>> = {
  [RUN_PORT]: 'the name of the gate every node has',
};

/** Whether *fields* has a field called *name* of its own: an object also has `constructor`, `toString` and the like, and a port named so is no field. */
export const hasField = (fields: object, name: string): boolean => Object.prototype.hasOwnProperty.call(fields, name);

/** What *node* holds, as a struct: `data_value` is an object, and each key is a field. Anything else is a struct of no field (`DataNodeDesign.problems`). */
function fieldsOf(node: Pick<GraphNode, 'config'>): Record<string, unknown> {
  const held = node.config.data_value;
  return isStruct(held) ? held : {};
}

/** The names of its fields: each is an input and an output. */
export const namesOf = (node: Pick<GraphNode, 'config'>): string[] => Object.keys(fieldsOf(node)).filter((name) => !hasField(RESERVED, name));

/** What the struct looks like filled, as written in example.json -- the fields as they start while nothing is. */
function exampleOf(node: Pick<GraphNode, 'config'>): Record<string, unknown> {
  const held = node.config.data_example;
  return isStruct(held) && Object.keys(held).length ? held : fieldsOf(node);
}

/**
 * A struct that lives between rounds: the graph's memory.
 *
 * It holds fields -- their names and their starting values in one file of its
 * own, data.json, an object -- and each field is an input and an output of the
 * node, under its name. The ports follow the file: what it
 * holds is the node's interface, and the Fields chat writes it from the node's
 * text -- with a second file, example.json, what the struct looks like once
 * rounds have filled it, so what is wired to it is written against more than
 * the empty start.
 *
 * It fills, then forwards: what arrives on a field replaces its value, and the
 * struct as it is then goes on to whatever reads it in the same round -- a
 * field nothing arrived on hands on what it kept. Where it stands decides what
 * a wire from it carries: to a node that runs after it, what it holds then; to
 * one that runs before it, what it held when the round began -- so a node that
 * reads the memory and writes it back stands before it, and the loop reads the
 * last round and writes this one (`readingWires`). Whoever reads
 * it from outside -- a gui, a script -- reads what the last round left
 * (`holds`), never a round half done.
 *
 * There is no code in it. Working out a new value -- a count plus one, the
 * last three -- is a code node: it reads a field's output and writes its input.
 */
export class DataNodeDefinition extends NodeDefinition<DataConfig> {
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
    return { fields: fieldsOf(node), example: exampleOf(node) };
  }

  /** One input and one output for each field: the ports follow what the node holds. */
  override derivedPorts(node: GraphNode) {
    const names = namesOf(node);
    return {
      inputs: names.map((name) => port(name, name, 'input', 'any', false, `Replaces "${name}" when something arrives`)),
      outputs: [
        ...names.map((name) => port(name, name, 'output', 'any', false, `"${name}", as it holds when it is read: what arrived this round, or else what it kept`)),
      ],
    };
  }

  override readonly isMemory = true;

  /** What arrived on a field is what it holds from now on. What arrives on a port that is no field is nobody's. */
  override settleMemory(node: GraphNode, portId: string, value: unknown): void {
    const held = fieldsOf(node);
    if (hasField(held, portId) && !hasField(RESERVED, portId)) node.config.data_value = { ...held, [portId]: value } as never;
  }

  /** Under its id with its whole content, and each field of it under the id and its name: what a session lets a gui or a script watch (`holds`). */
  override offers(node: GraphNode): Offer[] {
    const label = node.label || node.id;
    return [
      {
        kind: 'state', name: node.id, label, type: 'json',
        ...(node.description ? { description: node.description } : {}),
      },
      ...namesOf(node).map((name): Offer => ({ kind: 'state', name: `${node.id}.${name}`, part: name, label: `${label} · ${name}`, type: 'any' })),
    ];
  }

  /** Every field, as the last round left them: the whole struct. */
  override holds(node: GraphNode): unknown {
    return { ...fieldsOf(node) };
  }

  /** What it keeps, value by value: each field as it was given or last written. */
  override state(node: GraphNode): Record<string, unknown> {
    return { ...fieldsOf(node) };
  }

  /** Put back as it was kept: each value to its field -- one the design no longer has is nobody's. */
  override setState(node: GraphNode, kept: Record<string, unknown>): void {
    const fields = { ...fieldsOf(node) };
    for (const [name, value] of Object.entries(kept)) {
      if (hasField(fields, name)) fields[name] = value;
    }
    node.config.data_value = fields as never;
  }
}
