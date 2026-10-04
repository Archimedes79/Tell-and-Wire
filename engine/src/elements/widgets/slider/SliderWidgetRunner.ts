import { WidgetRunner, type Sent, type Widget } from '../../WidgetRunner.ts';
import { sliderRange, type SliderRange } from './range.ts';

/**
 * A number, chosen inside a range.
 *
 * `min`/`max`/`step` are the block's own settings, the same way a text box's
 * mode is: written once by a person, not generated and not wired in. What it
 * sends is always inside its own range, even if the stored value is stale
 * after a person narrows the range around it (`sliderRange`, which the page
 * reads too).
 */
export class SliderWidgetRunner extends WidgetRunner<SliderRange> {
  readonly widgetKind = 'slider' as const;

  config(widget: Widget): SliderRange {
    return sliderRange(widget.config);
  }

  /**
   * What it sends, said in words: the range it moves in. A node it reaches is
   * written by ✨ against what it is told arrives, and "number" alone left it
   * to guess whether 0.5 or 5000 can.
   */
  override sends(widget: Widget): Sent {
    const { min, max, step } = this.config(widget);
    return { type: 'number', description: `a number from ${min} to ${max} in steps of ${step}` };
  }

  override event(): 'change' {
    return 'change';
  }

  override async data(widget: Widget): Promise<unknown> {
    return this.config(widget).value;
  }

  // ── Build time ────────────────────────────────────────────────────────────

  override graphAuthorNote(): string {
    return 'min, max, step; it sends the number, and fires when it is let go';
  }
}
