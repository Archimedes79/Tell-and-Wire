// The mirror of `engine/src/elements/widgets/StaticWidgetRunner.ts`: a widget
// that is part of the page rather than part of the graph -- a heading, a rule,
// a gap. No connections, nothing to run, nothing to author.

import { WidgetGuiBuilder } from '../WidgetGuiBuilder';

export abstract class StaticWidgetGuiBuilder extends WidgetGuiBuilder {
  /**
   * Page furniture starts unnamed: a name says a block in the settings of the
   * points it connects to, and it connects to none. The palette's word for it
   * ("Heading", "Divider") would only be text nobody asked to see.
   */
  override initialLabel(): string {
    return '';
  }
}
