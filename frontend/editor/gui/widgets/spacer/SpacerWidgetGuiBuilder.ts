import { StaticWidgetGuiBuilder } from '../StaticWidgetGuiBuilder';
import { StretchHorizontal, StretchVertical } from 'lucide-react';

/** Nothing, on purpose: the widget that says "this section ends here". */
export class SpacerWidgetGuiBuilder extends StaticWidgetGuiBuilder {
  readonly widgetKind = 'spacer';

  readonly label = 'Gap';

  paletteEntries() {
    return [
      { mode: 'horizontal', label: this.label, icon: StretchHorizontal, also: 'space spacer' },
      { mode: 'vertical', label: 'Vertical gap', icon: StretchVertical },
    ];
  }

  override readonly defaultMode = 'horizontal';
}
