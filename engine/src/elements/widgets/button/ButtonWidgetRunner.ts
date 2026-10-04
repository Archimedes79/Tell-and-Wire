import { WidgetRunner } from '../../WidgetRunner.ts';

/**
 * A press: it fires the start point it names (`fires`), and sends nothing.
 *
 * That is all a button is. What the round is started with is what the blocks
 * that send to that start point hold -- a Send button beside a message box
 * fires the start point the box sends to. Which button it was, the package's
 * event says (`event.by`), so the first node can tell several apart.
 */
export class ButtonWidgetRunner extends WidgetRunner {
  readonly widgetKind = 'button' as const;

  override event(): 'press' {
    return 'press';
  }

  // ── Build time ────────────────────────────────────────────────────────────

  override graphAuthorNote(): string {
    return 'fires the start point named in "fires" when pressed; it sends nothing itself';
  }
}
