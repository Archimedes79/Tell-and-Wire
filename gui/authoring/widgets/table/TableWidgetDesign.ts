import { DisplayWidgetDesign } from '../DisplayWidgetDesign.ts';

export class TableWidgetDesign extends DisplayWidgetDesign {
  /** Rows, whose keys become the columns. */
  override draws(): string {
    return 'rows: a list of objects with the same keys -- each key becomes a column header, in the '
      + 'order the first row has them -- or a list of lists whose first row is the header.';
  }
}
