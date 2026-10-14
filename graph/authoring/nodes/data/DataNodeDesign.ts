import { NodeDesign, type WhatRuns } from '../NodeDesign.ts';
import { isStruct, type GraphNode } from '../../../graph.ts';
import type { Problem } from '../../../wiring.ts';
import type { Generation } from '../../generation.ts';
import { RESERVED, hasField, type DataNodeDefinition } from '../../../nodes/data/DataNodeDefinition.ts';

export class DataNodeDesign extends NodeDesign<DataNodeDefinition> {
  override graphAuthorNote(): string {
    return 'a struct kept between rounds: config.data_value is an object, and each of its keys is a field with a JSON value -- a count, a list, a text -- as it starts; '
      + 'config.data_example is the same struct as it looks filled, after some rounds, which what is wired to it is written against. '
      + 'A field keeps its value until something arrives on its input, which replaces it: the node fills, then forwards the struct as it is then, in the same round. '
      + 'In a loop -- a node reads a field and writes it back -- wire the field\'s output to an input of that node and the node\'s output to the field\'s input: the wire that closes the loop carries what the field held when the round began (the node runs first, and fills the data node), and orders nothing. A wire from a field to a node that is in no loop with it carries what it holds after the round\'s writes. '
      + 'Its ports are DERIVED from the fields, not taken from this document: each field is an input and an output under its name, '
      + 'for a field "count": input "count", output "count". '
      + 'Its description says in words what it holds: the nodes wired to it are generated against that and its fields. '
      + 'It has no code: working out a new value (a count plus one) is a code node that reads the field and writes the field\'s input: '
      + 'an edge from the field\'s output to an input of the code node, and an edge from the code node\'s output to the field\'s input. '
      + 'The start point or button that makes it happen is wired to that code node\'s ◆, not to the memory; what shows the new value is wired from the field\'s output.';
  }

  /** The fields as they start and as they look filled, written from its text and from what feeds it and what it feeds. */
  override generation(): Generation {
    return { kind: 'data', fields: { body: 'data_value', example: 'data_example' } };
  }

  override whatRuns(): WhatRuns {
    return this.graphRuns('Fills its fields from what arrives on them and hands each on -- a field nothing arrived on, what it kept; what arrived is kept for the next round.');
  }

  /** It holds one object; a field is a port, named with letters, digits and underscores -- not the name of the gate every node has. */
  override problems(node: GraphNode, _kinds: unknown, where: string): Problem[] {
    const held = node.config.data_value;
    if (held !== undefined && held !== null && !isStruct(held)) {
      return [{ where, problem: 'data.json is not one JSON object: each key of it is a field.', fix: 'Write the fields as one object, such as {"count": 0}.' }];
    }
    const example = node.config.data_example;
    if (example !== undefined && example !== null && !isStruct(example)) {
      return [{ where, problem: 'example.json is not one JSON object: it is the struct as it looks filled.', fix: 'Write it as one object with the fields of data.json.' }];
    }
    return Object.keys(this.kind.config(node).fields).flatMap((name): Problem[] => {
      if (hasField(RESERVED, name)) return [{ where, problem: `A field is called "${name}", which is ${RESERVED[name]}.`, fix: 'Rename it in data.json.' }];
      if (/^\w+$/.test(name)) return [];
      return [{ where, problem: `A field is called "${name}": a field is a port, named with letters, digits and underscores.`, fix: 'Rename it in data.json.' }];
    });
  }
}
