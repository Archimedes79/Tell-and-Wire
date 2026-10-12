// One block of a GUI, as the GUI holds it.

import type { WidgetKind } from '../../../../graph/graph.ts';

/**
 * One block on a gui. Nothing is wired to it: it connects itself to the
 * graph's start and end points by name (`sends_to`, `fires`, `shows`), and
 * its `id` is the name its data is sent under -- so it stays stable once
 * assigned, as what reads it reads it by that name.
 *
 * Beyond who it is, how it is drawn and how it connects, a block holds only
 * its own kind's settings, so they are optional here: a divider has no
 * options, and a block written by hand, by ✨ or over MCP leaves out what it
 * does not set. Read one the way its definition does -- `recursive` missing means
 * only the folder itself.
 */
export type GuiWidget = {
  /** `input_picker`: the file types a folder's listing keeps. */
  extensions?: string;
  h?: number;
  id: string;
  kind: WidgetKind;
  label: string;
  mode?: string;
  /** `input_picker`: a folder's listing looks into its subfolders too. */
  recursive?: boolean;
  /** `input_picker`: "path" sends only where the file is, not what is in it. */
  send?: string;
  tone: 'plain' | 'raised' | 'sunken' | 'accent';
  /** Draw a frame regardless of the tone; unset lets the tone decide. */
  border?: boolean;
  /** A background colour of your own; empty lets the tone decide. */
  background?: string;
  /** The start points its data goes to: it is in the package of each, under the block's id. */
  sends_to?: string[];
  /** The start point using it fires, or none. */
  fires?: string | null;
  /** The end point it shows, or none. */
  shows?: string | null;
  /** `select`: its choices, one per line. */
  options?: string;
  /** `slider`: the range and increment it moves in. */
  min?: number;
  max?: number;
  step?: number;
  value?: unknown;
  w?: number;
};
