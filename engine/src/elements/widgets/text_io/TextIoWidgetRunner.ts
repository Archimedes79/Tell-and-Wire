import { WidgetRunner, type Sent, type Widget } from '../../WidgetRunner.ts';
import type { RawConfig } from '../../../graph.ts';
import { textIoRole, type TextIoRole } from './role.ts';

export interface TextIoConfig {
  value: string;
  role: TextIoRole;
}

/** A box of text: typed into, shown in, or both. */
export class TextIoWidgetRunner extends WidgetRunner<TextIoConfig> {
  readonly widgetKind = 'text_io' as const;

  config(widget: Widget): TextIoConfig {
    return { value: String(widget.config.value ?? ''), role: textIoRole(widget.config.mode) };
  }

  /** What is typed into it -- unless it only shows. */
  override sends(widget: Widget): Sent | null {
    return this.config(widget).role === 'output' ? null : { type: 'text', description: 'what the person typed' };
  }

  /** Enter, in a box that is typed into. */
  override event(widget: Widget): 'enter' | null {
    return this.config(widget).role === 'output' ? null : 'enter';
  }

  /** A box that shows, or shows and is typed into. */
  override showsEnd(widget: Widget): boolean {
    return this.config(widget).role !== 'input';
  }

  override async data(widget: Widget): Promise<unknown> {
    return this.config(widget).value;
  }

  /**
   * What its end point hands back is shown, not typed.
   *
   * A box that only shows keeps what arrived: that is all it holds. A box a
   * person types into keeps what they typed. In "both" the reply is shown
   * above the typing box from what the round handed back, and settling it into
   * the value made it the next message -- the model's answer sent back to the
   * model as though the person had said it.
   */
  override settle(stored: RawConfig, value: unknown): void {
    if (textIoRole(stored.mode) === 'output') stored.value = value;
  }

  /**
   * A box whose Enter fires a start point holds a message, and a message is
   * said once: clear it when a round has delivered it, so the box is ready for
   * the next one. A box that does not fire holds a setting -- a search term, a
   * name -- and emptying that after every round would make the person retype it.
   */
  override clearsValueAfterRun(widget: Widget): boolean {
    return this.config(widget).role !== 'output' && !!widget.fires;
  }

  // ── Build time ────────────────────────────────────────────────────────────

  override graphAuthorNote(): string {
    return 'mode input (typed into: it sends the text, and Enter fires), output (shows its end point) or both '
      + '(typed into and showing), which is what a block without a mode is';
  }
}
