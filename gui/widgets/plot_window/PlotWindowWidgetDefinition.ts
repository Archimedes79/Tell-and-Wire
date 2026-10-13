import { DisplayWidgetDefinition } from '../DisplayWidgetDefinition.ts';

/** A chart of what arrives: points or a figure, drawn by the GUI -- or SVG, shown as it stands. */
export class PlotWindowWidgetDefinition extends DisplayWidgetDefinition {
  readonly widgetKind = 'plot_window' as const;
}
