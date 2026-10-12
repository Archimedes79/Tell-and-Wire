import { StaticWidgetDefinition } from '../StaticWidgetDefinition.ts';

/** A heading, a paragraph or a caption: one block, three formattings. */
export class TextWidgetDefinition extends StaticWidgetDefinition {
  readonly widgetKind = 'text' as const;
}
