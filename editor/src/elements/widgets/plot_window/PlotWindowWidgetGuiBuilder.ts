import { PlotWindowWidgetRunner } from '@engine/elements/widgets/plot_window/PlotWindowWidgetRunner.ts';
import { DisplayWidgetGuiBuilder } from '../DisplayWidgetGuiBuilder';
import { CHART_TEXT } from './PlotChart';

export class PlotWindowWidgetGuiBuilder extends DisplayWidgetGuiBuilder {
  readonly widgetKind = 'plot_window';

  // ── Build time ────────────────────────────────────────────────────────────

  readonly label = 'Chart';

  paletteEntries() {
    return [{ label: this.label, icon: '📊', also: 'plot graph diagram svg' }];
  }

  readonly runner = new PlotWindowWidgetRunner();

  /** Its labels and its title, at the sizes the chart draws them. */
  override textShown(): string {
    return `labels ${CHART_TEXT.label} px, title ${CHART_TEXT.title} px`;
  }
}
