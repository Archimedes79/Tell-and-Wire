import { StaticWidgetDefinition } from '../StaticWidgetDefinition.ts';

/** A rule between sections. Holds nothing at all. */
export class DividerWidgetDefinition extends StaticWidgetDefinition {
  readonly widgetKind = 'divider' as const;
}
