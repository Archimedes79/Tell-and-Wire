import { DisplayWidgetDefinition } from '../DisplayWidgetDefinition.ts';

/** A chart of what arrives: points or a figure, drawn by the gui -- or SVG, shown as it stands. */
export class PlotWindowWidgetDefinition extends DisplayWidgetDefinition {
  readonly widgetKind = 'plot_window' as const;
}
