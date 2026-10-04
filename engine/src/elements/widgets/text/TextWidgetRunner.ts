import { StaticWidgetRunner } from '../StaticWidgetRunner.ts';

/** A heading, a paragraph or a caption: one block, three formattings. */
export class TextWidgetRunner extends StaticWidgetRunner {
  readonly widgetKind = 'text' as const;

  // ── Build time ────────────────────────────────────────────────────────────

  override graphAuthorNote(): string {
    return 'mode heading|body|caption, value = the words';
  }
}
