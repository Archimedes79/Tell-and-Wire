import { lazy } from 'react';
import { WidgetGuiBuilder } from '../WidgetGuiBuilder';
import { ChevronsUpDown } from 'lucide-react';

export class SelectWidgetGuiBuilder extends WidgetGuiBuilder {
  readonly widgetKind = 'select';

  // ── Build time ────────────────────────────────────────────────────────────

  readonly label = 'Dropdown';

  paletteEntries() {
    return [{ label: this.label, icon: ChevronsUpDown, also: 'select choice options' }];
  }

  override readonly Panel = lazy(() => import('./SelectWidgetPanel'));

  protected override defaultSpan() {
    return { w: 6, h: 1 };
  }

  /** A control you operate looks like a field, or nobody touches it. */
  protected override defaultTone() {
    return 'sunken' as const;
  }

  /** Two options to start from, so the dropdown is never empty on the page. */
  protected override initialSettings() {
    return { options: 'Option A\nOption B' };
  }
}
