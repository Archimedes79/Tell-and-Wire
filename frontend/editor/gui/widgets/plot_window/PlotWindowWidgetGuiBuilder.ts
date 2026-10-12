import { DisplayWidgetGuiBuilder } from '../DisplayWidgetGuiBuilder';
import { CHART_TEXT } from '../../../../deployment/gui/widgets/plot_window/PlotChart';
import { BarChart3 } from 'lucide-react';

export class PlotWindowWidgetGuiBuilder extends DisplayWidgetGuiBuilder {
  readonly widgetKind = 'plot_window';

  readonly label = 'Chart';

  paletteEntries() {
    return [{ label: this.label, icon: BarChart3, also: 'plot graph diagram svg' }];
  }

  /** Its labels and its title, at the sizes the chart draws them. */
  override textShown(): string {
    return `labels ${CHART_TEXT.label} px, title ${CHART_TEXT.title} px`;
  }

  /** What a run shows is a card, like the other results on the page. */
  protected override defaultTone() {
    return 'raised' as const;
  }
}
