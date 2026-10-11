import { StaticWidgetDefinition } from '../StaticWidgetDefinition.ts';

/** Air between sections — the block that says one thing ended. */
export class SpacerWidgetDefinition extends StaticWidgetDefinition {
  readonly widgetKind = 'spacer' as const;
}
