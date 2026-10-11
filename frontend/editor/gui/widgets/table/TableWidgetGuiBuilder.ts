import { DisplayWidgetGuiBuilder } from '../DisplayWidgetGuiBuilder';
import { TABLE_TEXT } from '../../../../deployment/gui/widgets/table/TableWidgetView';
import { Table } from 'lucide-react';

export class TableWidgetGuiBuilder extends DisplayWidgetGuiBuilder {
  readonly widgetKind = 'table';

  // ── Build time ────────────────────────────────────────────────────────────

  readonly label = 'Table';

  paletteEntries() {
    return [{ label: this.label, icon: Table, also: 'rows grid data' }];
  }

  /** Its rows, at the size the table draws them. */
  override textShown(): string {
    return `${TABLE_TEXT} px rows`;
  }
}
