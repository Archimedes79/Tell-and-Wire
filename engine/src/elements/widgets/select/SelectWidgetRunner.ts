import { WidgetRunner, type Sent, type Widget } from '../../WidgetRunner.ts';
import { selectChoice, selectOptions } from './choice.ts';

export interface SelectConfig {
  value: string;
  options: string[];
}

/**
 * One choice from a fixed list, picked on the page.
 *
 * The list is written once, in the block's own settings — not generated, not
 * wired in: a dropdown is furniture whose options a person decides, the same
 * way a folder's file types are a decision rather than a value. Its own
 * choice is what it sends.
 */
export class SelectWidgetRunner extends WidgetRunner<SelectConfig> {
  readonly widgetKind = 'select' as const;

  config(widget: Widget): SelectConfig {
    const options = selectOptions(widget.config.options);
    return { value: selectChoice(options, widget.config.value), options };
  }

  /**
   * What it sends, said in words: the choices it can send. A node a dropdown's
   * choice reaches is written by ✨ against what it is told arrives, and "text"
   * is all an empty one says -- so code compared the choice with values the
   * dropdown never offers.
   */
  override sends(widget: Widget): Sent {
    const { options } = this.config(widget);
    return { type: 'text', description: options.length ? `one of: ${options.join(', ')}` : 'the choice made' };
  }

  override event(): 'change' {
    return 'change';
  }

  override async data(widget: Widget): Promise<unknown> {
    return this.config(widget).value;
  }

  // ── Build time ────────────────────────────────────────────────────────────

  override graphAuthorNote(): string {
    return 'options = one per line; it sends the choice, and fires on a choice made';
  }
}
