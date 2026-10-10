import type { DataType, Port, PortKind } from '../graph.ts';

/**
 * One port, with the defaults spelled out once.
 *
 * Built here rather than inline -- in the editor's node creation, where a
 * node's mode changes, per widget kind -- so no copy can quietly differ in
 * `multi`: that the port carries a list -- what a node run once per item runs
 * over, or collects its calls' lists into, and what `check` holds a wire to.
 * Not whether several edges collect into one: any port fed by several does
 * (`collectInputs`).
 */
export function port(
  id: string,
  name: string,
  kind: PortKind,
  dataType: DataType,
  multi = false,
  description = '',
): Port {
  return { id, name, kind, data_type: dataType, multi, required: false, description };
}

/**
 * Ports that follow from a node's settings -- a data node's from its fields,
 * a subgraph's from the graph it holds -- with the one thing a person chooses for each of
 * its inputs kept from the ports it has now (*inputs*): which part of a start
 * point's package it takes (`Port.field`). That is a choice about the wire
 * into it, not about the node, so deriving the ports again must not undo it.
 */
export function keepingFields(derived: { inputs: Port[]; outputs: Port[] }, inputs: readonly Port[]): { inputs: Port[]; outputs: Port[] } {
  const fields = new Map(inputs.flatMap((input) => (input.field ? [[input.id, input.field] as const] : [])));
  if (!fields.size) return derived;
  return { ...derived, inputs: derived.inputs.map((input) => (fields.has(input.id) ? { ...input, field: fields.get(input.id) } : input)) };
}
