import { lazy } from 'react';
import { WidgetGuiBuilder } from '../WidgetGuiBuilder';
import { ChevronsUpDown } from 'lucide-react';

export class SelectWidgetGuiBuilder extends WidgetGuiBuilder {
  readonly widgetKind = 'select';

  readonly label = 'Dropdown';

  paletteEntries() {
    return [{ label: this.label, icon: ChevronsUpDown, also: 'select choice options' }];
  }

  override readonly Panel = lazy(() => import('./SelectWidgetPanel'));

  protected override defaultSpan() {
    return { w: 6, h: 1 };
  }

  /** The control draws its own frame; a card around it would be a box in a box. */
  protected override defaultTone() {
    return 'plain' as const;
  }

  /** Two options to start from, so the dropdown is never empty on the GUI. */
  protected override initialSettings() {
    return { options: 'Option A\nOption B' };
  }
}
