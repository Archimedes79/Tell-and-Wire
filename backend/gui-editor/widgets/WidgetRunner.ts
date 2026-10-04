// A widget: the element branch that sits on the page a graph is used through.

import type { DataType, RawConfig, WidgetKind } from '../../../graph/graph.ts';
import { ElementRunner } from '../../../graph/nodes/ElementRunner.ts';
import type { Runtime } from '../../../graph/nodes/Runtime.ts';

/**
 * What a round the page starts asks a person before it runs: a file or a
 * folder for a picker with nothing chosen. Asked under the key it is answered
 * by -- the block's id -- so a dialog in the editor and a frontend that sends
 * answers read the same list.
 */
export interface RuntimeRequirement {
  /** What answers it is given under: the block's id. */
  key: string;
  label: string;
  kind: 'file' | 'directory';
  /** What it holds now, offered as the default. */
  current: string;
}

/**
 * How a block sits on the page. Nothing an element ever reads to decide what
 * it does: the page draws from these, the engine only carries them.
 */
export interface WidgetPresentation {
  w: number;
  h: number;
  tone: string;
  /** Draw a frame, whatever the tone would do. Unset: the tone decides. */
  border?: boolean;
  /** A background colour of the person's own. Empty: the tone decides. */
  background?: string;
}

/**
 * How a block connects itself to the graph -- by name, never by a wire: where
 * its data goes, which start point its event fires, which end point it shows.
 * The graph owns the start and end points; the block says which it uses.
 */
export interface WidgetConnections {
  /** The start points its data goes to: it is in the package of each, under the block's id. */
  sends_to: string[];
  /** The start point its event fires, or none. */
  fires: string | null;
  /** The end point it shows, or none. */
  shows: string | null;
}

/**
 * A block: who it is, how it is drawn, how it connects, and its element's
 * settings.
 *
 * Flat on purpose. The parts are named so the split is visible in the type,
 * but they are not nested: nesting would have to be undone by `parseWidget`
 * on every read anyway, since the stored file is flat, and two copies of one
 * fact are not a clearer design than one. What separates them from the
 * settings is the type, and `OWN` in `page.ts` is checked against it.
 */
export interface Widget extends WidgetPresentation, WidgetConnections {
  id: string;
  kind: WidgetKind;
  label: string;
  /** The element's settings: everything the file holds that is not named above. */
  config: RawConfig;
}

/**
 * What a block sends, in words for whoever reads the package it goes into --
 * the node a start point hands it to, and ✨ writing that node.
 */
export interface Sent {
  type: DataType;
  /** A list of them. */
  list?: boolean;
  /**
   * The parts of what it sends, where that is an object a node may take one
   * of (`Port.field`), each with its type and what it is: a file's `path` and
   * `content`. An input that takes one is told of that part alone.
   */
  keys?: Record<string, { type: DataType; description: string }>;
  /** The part a node works on, where one is: a file's `content`. What an input takes when nobody said. */
  main?: string;
  /** What it is: "what the person typed", "one of: a, b, c", "a number from 0 to 10". */
  description: string;
}

/** An object's parts, each said as `Sent.keys` says it: `{"path": where it is, "content": what is in it}`. */
export function partsSaid(keys: NonNullable<Sent['keys']>): string {
  return `{${Object.entries(keys).map(([key, part]) => `"${key}": ${part.description}`).join(', ')}}`;
}

/** What a person does to a block that fires a start point, as the package names it. */
export type BlockEvent = 'press' | 'enter' | 'change' | 'send';

export abstract class WidgetRunner<C = unknown> extends ElementRunner<Widget, C> {
  // ── What it is ────────────────────────────────────────────────────────────
  // Its kind, and what it can do with the graph: send, fire, show.

  abstract readonly widgetKind: WidgetKind;

  /**
   * What this block sends -- its data, under its id in the package of each
   * start point it sends to -- or null for a block that sends nothing: a
   * heading, a chart, a button.
   */
  sends(_widget: Widget): Sent | null {
    return null;
  }

  /**
   * What a person does to this block that can fire a start point: a button's
   * press, Enter in a box, a choice made, a message sent. Null for a block
   * whose use fires nothing. Whether it does is the block's `fires`.
   */
  event(_widget: Widget): BlockEvent | null {
    return null;
  }

  /** Whether this block can show an end point: what the graph hands back there is shown on it. */
  showsEnd(_widget: Widget): boolean {
    return false;
  }

  // ── Run time ──────────────────────────────────────────────────────────────
  // What a round asks of it: what it sends, and what arriving means.

  /**
   * Its data as a start point's package holds it: what it holds, or what it
   * reads from what it holds -- a folder's listing, a file's text. A failure
   * here is the round's: it cannot start on what was not sent.
   */
  async data(widget: Widget, _runtime: Runtime): Promise<unknown> {
    return widget.config.value ?? null;
  }

  /**
   * Whether this block keeps something between rounds: what a person sets on
   * it, or what an end point handed it. A heading, a divider, a spacer are
   * their design and nothing else.
   */
  keepsState(widget: Widget): boolean {
    return this.sends(widget) !== null || this.showsEnd(widget);
  }

  /**
   * Keep what the end point it shows handed back, for the page to show.
   *
   * `stored` is the block as the page holds it. Most blocks simply become the
   * value; one that holds more than the last thing it was told -- a
   * conversation -- says here what arriving means.
   */
  settle(stored: RawConfig, value: unknown): void {
    stored.value = value;
  }

  /**
   * Whether what this block holds was a *message* -- said once, and emptied
   * once a round has delivered it -- rather than a setting someone would have to
   * retype.
   *
   * Here and not in the browser half: what a run means for a block is the
   * block's own business, the same family as `settle` above.
   */
  clearsValueAfterRun(_widget: Widget): boolean {
    return false;
  }

  /** Last step before what an end point handed this block reaches the page: an image's path read into the picture. */
  async displayValue(_widget: Widget, value: unknown, _runtime: Runtime): Promise<unknown> {
    return value;
  }

  /**
   * What this block needs a person to supply before the graph can run -- a
   * picker with nothing chosen. Its page asks it under the block's own key,
   * which is the page's to make; most blocks ask nothing.
   */
  runtimeRequirements(_widget: Widget): Omit<RuntimeRequirement, 'key'>[] {
    return [];
  }

  /** Whether a person sets what this block sends: a choice, a text, a path, a message -- not a button's press. */
  takesValue(widget: Widget): boolean {
    return this.sends(widget) !== null;
  }

  /** Keep a value given from outside -- a person, a page -- in *stored*, the block as the page holds it. */
  setValue(stored: RawConfig, value: unknown): void {
    stored.value = value;
  }

  // ── Build time ────────────────────────────────────────────────────────────
  // What building a neighbour asks of it.

  /**
   * What the node wired into the end point this block shows should hand it,
   * in a sentence for that node's ✨ -- or nothing, for a block that takes
   * whatever comes.
   *
   * Said by the block because it is a fact about the block: a chart takes
   * points, a table takes rows whose keys become its columns.
   */
  receives(_widget: Widget): string | undefined {
    return undefined;
  }

  /**
   * This kind's settings and what it sends, fires and shows, in a line for the
   * model that designs a whole graph -- or nothing, for a kind that has none
   * worth saying. The page's note lists every kind with its line (`page.ts`),
   * so a new kind is in the prompt by being written.
   */
  graphAuthorNote(): string | undefined {
    return undefined;
  }

  /** Files and folders this block names as its own defaults, which a bundle carries: what a picker starts on. */
  referencedPaths(_widget: Widget): string[] {
    return [];
  }

  /**
   * Whether what this block holds is part of the page's design -- a choice, a
   * text, a path to start on, set while the page is built -- rather than only
   * ever what using it left: a conversation is what was said, never what a
   * page starts with. The editor's Page tab writes the first kind into the
   * design as it is set there; the second is the session's wherever it is set.
   */
  valueIsDesign(_widget: Widget): boolean {
    return true;
  }
}
