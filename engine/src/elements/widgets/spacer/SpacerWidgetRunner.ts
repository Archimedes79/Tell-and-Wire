import { StaticWidgetRunner } from '../StaticWidgetRunner.ts';

/** Air between sections — the block that says one thing ended. */
export class SpacerWidgetRunner extends StaticWidgetRunner {
  readonly widgetKind = 'spacer' as const;
}
