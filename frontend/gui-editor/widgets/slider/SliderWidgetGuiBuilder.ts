import { lazy } from 'react';
import { WidgetGuiBuilder } from '../WidgetGuiBuilder';
import { SlidersHorizontal } from 'lucide-react';

export class SliderWidgetGuiBuilder extends WidgetGuiBuilder {
  readonly widgetKind = 'slider';

  // ── Build time ────────────────────────────────────────────────────────────

  readonly label = 'Slider';

  paletteEntries() {
    return [{ label: this.label, icon: SlidersHorizontal, also: 'number range' }];
  }

  override readonly Panel = lazy(() => import('./SliderWidgetPanel'));

  override readonly firesHint =
    'Letting go of the handle (or an arrow key) starts a run at that start point — not every value it passes on the way.';

  protected override defaultSpan() {
    return { w: 8, h: 2 };
  }

  /** A control you operate looks like a field, or nobody touches it. */
  protected override defaultTone() {
    return 'sunken' as const;
  }

  protected override initialSettings() {
    return { min: 0, max: 100, step: 1 };
  }
}
