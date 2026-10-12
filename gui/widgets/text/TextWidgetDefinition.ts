import { StaticWidgetDefinition } from '../StaticWidgetDefinition.ts';

/** A heading of the first or second level, a paragraph or a caption: one block, four formattings. */
export class TextWidgetDefinition extends StaticWidgetDefinition {
  readonly widgetKind = 'text' as const;
}
