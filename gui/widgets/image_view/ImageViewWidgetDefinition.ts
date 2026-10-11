import { type Runtime } from '../../../graph/nodes/Runtime.ts';
import { type Widget } from '../WidgetDefinition.ts';
import { imageDataUrl, isInlineUrl } from '../../../graph/nodes/images.ts';
import { DisplayWidgetDefinition } from '../DisplayWidgetDefinition.ts';

/** An image, by path, URL or data URL. */
export class ImageViewWidgetDefinition extends DisplayWidgetDefinition {
  readonly widgetKind = 'image_view' as const;

  /**
   * Whatever arrived, turned into something a browser can render.
   *
   * A path is read and inlined; a value that is already a data or http URL
   * passes through; a list becomes a list of the same, so a folder picker
   * wired straight in shows a contact sheet. The one thing this block does
   * that a chart does not.
   *
   * A failure is shown, not raised. Nothing downstream depends on a picture,
   * and taking the whole node down would take every sibling block's output
   * with it. A "⚠" message that arrives is shown as it is, not read as a path.
   */
  override async displayValue(widget: Widget, value: unknown, runtime: Runtime): Promise<unknown> {
    if (Array.isArray(value)) {
      return Promise.all(value.map((item) => this.displayValue(widget, item, runtime)));
    }
    if (typeof value !== 'string' || !value.trim()) return value;
    if (isInlineUrl(value) || value.startsWith('⚠ ')) return value;
    try {
      return await imageDataUrl(value, runtime.files);
    } catch (error) {
      return `⚠ ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
