import { DisplayWidgetDesign } from '../DisplayWidgetDesign.ts';

export class PlotWindowWidgetDesign extends DisplayWidgetDesign {
  /**
   * What to plot. The gui draws points and figures itself, at the block's
   * real size and in its colours -- neither of which exists while the graph
   * runs, so that is what a node should prefer to hand on. SVG is for a plot
   * the four shapes cannot draw, and is shown as it stands.
   */
  override draws(): string {
    return 'what to plot: a list of points -- numbers, or {"label": string, "value": number} -- or a figure '
      + '{"kind": "bars"|"columns"|"line"|"donut", "title": string, "points": [...]}, which the chart draws at the '
      + 'block\'s real size and in the gui\'s colours; a figure with no points yet shows its title instead, so say '
      + 'there what to do. Any other plot (a scatter, several series) can arrive as a '
      + 'finished SVG document, a string starting with "<svg" with a viewBox and width="100%" height="100%", shown as it stands.';
  }
}
