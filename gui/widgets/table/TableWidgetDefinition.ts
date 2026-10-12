import { DisplayWidgetDefinition } from '../DisplayWidgetDefinition.ts';

/** Rows to show, as a list of objects. */
export class TableWidgetDefinition extends DisplayWidgetDefinition {
  readonly widgetKind = 'table' as const;
}
