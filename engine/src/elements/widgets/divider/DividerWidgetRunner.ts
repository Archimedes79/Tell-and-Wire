import { StaticWidgetRunner } from '../StaticWidgetRunner.ts';

/** A rule between sections. Holds nothing at all. */
export class DividerWidgetRunner extends StaticWidgetRunner {
  readonly widgetKind = 'divider' as const;
}
