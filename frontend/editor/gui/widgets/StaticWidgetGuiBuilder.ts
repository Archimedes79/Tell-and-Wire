// The mirror of `gui/widgets/StaticWidgetDefinition.ts`: a widget
// that is part of the gui rather than part of the graph -- a heading, a rule,
// a gap. No connections, nothing to run, nothing to write.

import { WidgetGuiBuilder } from './WidgetGuiBuilder';

export abstract class StaticWidgetGuiBuilder extends WidgetGuiBuilder {
  /**
   * Gui furniture starts unnamed: a name says a block in the settings of the
   * points it connects to, and it connects to none. The palette's word for it
   * ("Heading", "Divider") would only be text nobody asked to see.
   */
  override initialLabel(): string {
    return '';
  }

  /**
   * One row, the whole width: a heading, a rule that ends a section, a gap, a
   * line or two of a paragraph -- it starts where every other widget starts,
   * with no air above it, and a text grows as it is written (`TextInPlace`). A
   * vertical rule or gap stands between two things side by side, so it is
   * narrow and tall.
   */
  protected override defaultSpan(mode: string) {
    return mode === 'vertical' ? { w: 1, h: 4 } : { w: 16, h: 1 };
  }
}
