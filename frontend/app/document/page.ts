// The page of the document: blocks that connect themselves to the graph's
// start and end points by name.
//
// What a block can do with the graph -- send its data, fire a start point,
// show an end point -- is the runner's answer (`WidgetRunner.sends`, `event`,
// `showsEnd`), asked of the same element a round asks, so the Page tab never
// offers a connection a round then ignores and `check` names.

import type { DataType, GraphNode, GuiWidget, Port } from '../graph';
import type { Sent } from '../../../backend/gui-editor/widgets/WidgetRunner.ts';
import { parseWidget, widgetElement } from '../../../backend/gui-editor/widgets/page.ts';
import { registry as runnerRegistry } from '../../../graph/nodes/registry.ts';

/** What *widget* can do with the graph: what it sends -- none, for a heading or a button --, whether using it is an event, whether it shows an end point. */
export function blockCan(widget: GuiWidget): { sends: Sent | null; fires: boolean; shows: boolean } {
  const element = widgetElement(widget.kind);
  const parsed = parseWidget(widget);
  return {
    sends: element?.sends(parsed) ?? null,
    fires: !!element?.event(parsed),
    shows: !!element?.showsEnd(parsed),
  };
}

/** Whether a person sets what this block sends, and a round the page starts is given it by the block's id -- the runner's answer. */
export function widgetTakesValue(widget: GuiWidget): boolean {
  return widgetElement(widget.kind)?.takesValue(parseWidget(widget)) ?? false;
}

/**
 * Whether what this block holds is part of the page's design, set while the
 * page is built -- not a conversation, which is only ever the session's -- the
 * runner's answer (`WidgetRunner.valueIsDesign`).
 */
export function widgetValueIsDesign(widget: GuiWidget): boolean {
  return widgetElement(widget.kind)?.valueIsDesign(parseWidget(widget)) ?? true;
}

/** What the node wired into the end point *widget* shows should hand it, in the block's words -- or nothing, for a block that takes whatever comes. */
export function blockReceives(widget: GuiWidget): string | undefined {
  return widgetElement(widget.kind)?.receives(parseWidget(widget));
}

/** The files and folders *widget* starts on -- what a picker is set to -- the runner's answer (`WidgetRunner.referencedPaths`). */
export function startsOn(widget: GuiWidget): string[] {
  return widgetElement(widget.kind)?.referencedPaths(parseWidget(widget)) ?? [];
}

/** A start or end point, or a memory node, as a block's settings offer it: what it is called by, and what a person reads. */
export interface Point {
  id: string;
  label: string;
  /** A memory node: what it holds is shown, with no round. */
  memory?: boolean;
}

/** The start points a block can send to and fire: the ones the page starts. */
export function pageStartPoints(nodes: GraphNode[]): Point[] {
  return nodes
    .filter((node) => runnerRegistry.node(node.node_type)?.startedBy(node as never) === 'page')
    .map((node) => ({ id: node.id, label: node.label || node.id }));
}

/** The end points a block can show: what the graph hands back, by name. */
export function endPoints(nodes: GraphNode[]): Point[] {
  return nodes.flatMap((node) => {
    const element = runnerRegistry.node(node.node_type);
    return element?.isResult ? [{ id: node.id, label: element.resultLabel(node as never) }] : [];
  });
}

/** The memory nodes a block can show, and each part of what they hold -- a field, the round count: what each holds, by name, whether or not a round has run. */
export function memoryPoints(nodes: GraphNode[]): Point[] {
  return nodes.flatMap((node) => (runnerRegistry.node(node.node_type)?.offers(node as never) ?? [])
    .filter((offer) => offer.kind === 'state')
    .map((offer) => ({ id: offer.name, label: offer.label, memory: true })));
}

/** Whether what a block shows, *name*, is one of *named* -- or a part of one: a memory's field is its id, a dot and the field's name. */
const showsOf = (named: Set<string>, name: string | null | undefined): boolean => !!name && (named.has(name) || named.has(name.split('.')[0]));

/** The blocks of *blocks* that name one of the points *ids*: what the page loses with them. */
export function connectedTo(blocks: GuiWidget[], ids: readonly string[]): GuiWidget[] {
  const named = new Set(ids);
  return blocks.filter((block) => (block.fires && named.has(block.fires)) || showsOf(named, block.shows)
    || (block.sends_to ?? []).some((id) => named.has(id)));
}

/** *blocks* with every connection to one of the points *ids* taken off: what is left of the page once they are gone. */
export function withoutPoints(blocks: GuiWidget[], ids: readonly string[]): GuiWidget[] {
  const named = new Set(ids);
  return blocks.map((block) => {
    if (!connectedTo([block], ids).length) return block;
    const sends = (block.sends_to ?? []).filter((id) => !named.has(id));
    const { sends_to: _sends, fires: _fires, shows: _shows, ...rest } = block;
    return {
      ...rest,
      ...(sends.length ? { sends_to: sends } : {}),
      ...(block.fires && !named.has(block.fires) ? { fires: block.fires } : {}),
      ...(block.shows && !showsOf(named, block.shows) ? { shows: block.shows } : {}),
    };
  });
}

/** One thing an input can take of a start point's package (`Port.field`): what a block sends, whole or one part of it, with its type. */
export interface FieldChoice {
  value: string;
  label: string;
  type: DataType;
  /** A list of them: a folder's files. */
  list?: boolean;
}

/** How a port would be typed to take *value*: a text, a number, a structure -- and whether it is a list of them. */
function typedAs(value: unknown): { type: DataType; list?: boolean } {
  if (Array.isArray(value)) return { type: typedAs(value.find((item) => item !== null && item !== undefined)).type, list: true };
  if (typeof value === 'string') return { type: 'text' };
  if (typeof value === 'number') return { type: 'number' };
  if (typeof value === 'boolean') return { type: 'boolean' };
  return { type: value && typeof value === 'object' ? 'json' : 'any' };
}

/**
 * What an input wired from start point *start* can take of what a call sends
 * it: each part of what it is sent, for example (`config.values`) -- `file`,
 * and `file.content` inside it -- typed as the example is.
 */
function exampleChoices(start: GraphNode): FieldChoice[] {
  const example = start.config.values;
  if (!example || typeof example !== 'object' || Array.isArray(example)) return [];
  const choice = (value: string, label: string, part: unknown): FieldChoice => {
    const { type, list } = typedAs(part);
    return { value, label, type, ...(list ? { list: true } : {}) };
  };
  return Object.entries(example).flatMap(([key, part]) => [
    choice(key, key, part),
    ...(part && typeof part === 'object' && !Array.isArray(part)
      ? Object.entries(part).map(([inner, value]) => choice(`${key}.${inner}`, `${key} · ${inner}`, value))
      : []),
  ]);
}

/**
 * What an input wired from start point *start* can take of its package: what
 * each block that sends to it sends, whole -- under the block's id -- or one
 * part of it, `file.content`; and each part of what a call sends it, for
 * example.
 */
export function fieldChoices(blocks: GuiWidget[], start: GraphNode): FieldChoice[] {
  const paged = blocksAt(blocks, start.id).send.flatMap((block) => {
    const name = block.label || block.id;
    const sent = blockCan(block).sends!;
    return [
      { value: block.id, label: name, type: sent.type, ...(sent.list ? { list: true } : {}) },
      ...Object.entries(sent.keys ?? {}).map(([key, part]) => ({ value: `${block.id}.${key}`, label: `${name} · ${key}`, type: part.type })),
    ];
  });
  const named = new Set(paged.map((choice) => choice.value));
  return [...paged, ...exampleChoices(start).filter((choice) => !named.has(choice.value))];
}

/**
 * *port* taking *choice* of what its start point is sent -- typed as what it
 * takes is: a file's content is text, a folder's files a list of paths, read
 * where they arrive, whether the wire or a later choice said so -- or, with
 * none, the whole package, one object. A list only where what it takes is
 * one: a text box taken after a folder was still "a list". A port whose type
 * follows from its node's settings (*retype* false: a folder's path, a
 * subgraph's port) takes the part and keeps its type.
 */
export function takenAs(port: Port, choice: FieldChoice | undefined, retype = true): Port {
  if (!choice) {
    const { field: _field, ...rest } = port;
    return retype ? { ...rest, data_type: 'json', multi: false } : rest;
  }
  if (!retype) return { ...port, field: choice.value };
  return { ...port, field: choice.value, data_type: choice.type, multi: choice.list === true };
}

/**
 * What input *port* wired from start point *start* takes of its package when
 * nobody said: of what the one block that sends to it sends, the part the
 * input is named after (`message`, `history` of a chat), else the part a
 * node works on (a file's content), else all of it. Where no block sends to
 * it, of what a call sends it for example: the part the input is named
 * after, else the one part there is -- what the graph above sends a start
 * point in there, under its own name. Nothing, where several send or the
 * example has several parts, and the input takes the whole package.
 */
export function defaultField(blocks: GuiWidget[], start: GraphNode, port?: Port): { choice: FieldChoice; name: string } | undefined {
  const senders = blocksAt(blocks, start.id).send;
  if (senders.length > 1) return undefined;
  if (senders.length === 1) {
    const [block] = senders;
    const choices = fieldChoices([block], { ...start, config: { ...start.config, values: {} } });
    const main = blockCan(block).sends?.main;
    const part = (key: string | undefined) => (key ? choices.find((choice) => choice.value === `${block.id}.${key}`) : undefined);
    return { choice: part(port?.id) ?? part(main) ?? choices[0], name: block.label || block.id };
  }
  const choices = exampleChoices(start);
  const parts = choices.filter((choice) => !choice.value.includes('.'));
  const choice = choices.find((one) => one.value === port?.id) ?? (parts.length === 1 ? parts[0] : undefined);
  return choice ? { choice, name: choice.label } : undefined;
}

/** The blocks of *blocks* that fire, send to and show the point *id* -- or a part of it: what that point's card says of the page. */
export function blocksAt(blocks: GuiWidget[], id: string): { fire: GuiWidget[]; send: GuiWidget[]; show: GuiWidget[] } {
  const named = new Set([id]);
  return {
    fire: blocks.filter((block) => block.fires === id && blockCan(block).fires),
    send: blocks.filter((block) => (block.sends_to ?? []).includes(id) && !!blockCan(block).sends),
    show: blocks.filter((block) => showsOf(named, block.shows) && blockCan(block).shows),
  };
}
