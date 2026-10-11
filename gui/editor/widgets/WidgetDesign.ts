// What only building the gui asks of a widget: what to tell a neighbour, the
// model that writes a graph, a package. A package carries none of it, so it
// lives under `editor`; a kind that has something to say of its own overrides
// a member in `<kind>/<Kind>WidgetDesign.ts`, the rest answer as here.

import type { Widget, WidgetDefinition } from '../../widgets/WidgetDefinition.ts';

export class WidgetDesign<D extends WidgetDefinition = WidgetDefinition> {
  /** The widget as a run knows it: its settings are read through it. */
  protected readonly kind: D;

  constructor(kind: D) {
    this.kind = kind;
  }

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
   * worth saying. The gui's note lists every kind with its line
   * (`guiAuthorNote`), so a new kind is in the prompt by being written.
   */
  graphAuthorNote(): string | undefined {
    return undefined;
  }

  /** Files and folders this block names as its own defaults, which a package carries: what a picker starts on. */
  referencedPaths(_widget: Widget): string[] {
    return [];
  }

  /**
   * Whether what this block holds is part of the gui's design -- a choice, a
   * text, a path to start on, set while the gui is built -- rather than only
   * ever what using it left: a conversation is what was said, never what a
   * gui starts with. The editor's Gui tab writes the first kind into the
   * design as it is set there; the second is the session's wherever it is set.
   */
  valueIsDesign(_widget: Widget): boolean {
    return true;
  }
}
