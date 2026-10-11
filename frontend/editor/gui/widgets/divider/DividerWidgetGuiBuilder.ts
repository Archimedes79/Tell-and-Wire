import { StaticWidgetGuiBuilder } from '../StaticWidgetGuiBuilder';
import { Minus, SeparatorVertical } from 'lucide-react';

/** A rule between sections. */
export class DividerWidgetGuiBuilder extends StaticWidgetGuiBuilder {
  readonly widgetKind = 'divider';

  readonly label = 'Divider';

  paletteEntries() {
    return [
      { mode: 'horizontal', label: this.label, icon: Minus, also: 'line rule hr' },
      { mode: 'vertical', label: 'Vertical divider', icon: SeparatorVertical },
    ];
  }

  override readonly defaultMode = 'horizontal';
}
