import { WidgetGuiBuilder } from '../WidgetGuiBuilder';
import { RectangleHorizontal } from 'lucide-react';

/** A button: pressing it fires the start point it names. Nothing to set beyond its label and that. */
export class ButtonWidgetGuiBuilder extends WidgetGuiBuilder {
  readonly widgetKind = 'button';

  override readonly firesWhenMade = true;

  override readonly firesHint =
    'Pressing it starts a run at that start point: what it is wired to runs, and what follows from it — not the whole graph.';

  // ── Build time ────────────────────────────────────────────────────────────

  readonly label = 'Button';

  paletteEntries() {
    return [{ label: this.label, icon: RectangleHorizontal, also: 'run start go trigger' }];
  }

  protected override defaultSpan() {
    return { w: 5, h: 2 };
  }
}
