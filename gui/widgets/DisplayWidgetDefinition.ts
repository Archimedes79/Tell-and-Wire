import { WidgetDefinition } from './WidgetDefinition.ts';

/**
 * A block that only shows something: a chart, a table, an image -- what the
 * end point it shows hands back. It runs no code of its own: shaping a value
 * into what a block can draw is a code node's work, wired in before the end
 * point.
 */
export abstract class DisplayWidgetDefinition extends WidgetDefinition {
  override showsEnd(): boolean {
    return true;
  }
}
