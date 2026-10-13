import { type Runtime } from '../../../graph/nodes/Runtime.ts';
import { type Widget } from '../WidgetDefinition.ts';
import { imageDataUrl, isInlineUrl } from '../../../graph/nodes/images.ts';
import { DisplayWidgetDefinition } from '../DisplayWidgetDefinition.ts';
import { messageOf } from '../../../graph/errors.ts';

/** SVG markup as a picture: it says it is SVG (a picture's SVG has to, which markup inside a page need not). */
export function svgDataUrl(markup: string): string {
  const text = markup.trim();
  const svg = /^<svg\b[^>]*\sxmlns=/i.test(text) ? text : text.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** An image, by path, URL, data URL or the markup of an SVG a step drew. */
export class ImageViewWidgetDefinition extends DisplayWidgetDefinition {
  readonly widgetKind = 'image_view' as const;

  /**
   * Whatever arrived, turned into something a browser can render.
   *
   * A path is read and inlined; a value that is already a data or http URL
   * passes through; a list becomes a list of the same, so a folder picker
   * wired straight in shows a contact sheet. SVG markup (what a code step draws) becomes a data URL, which a picture can show
   * where the markup itself would run in the page. The one thing this block does
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
    if (/^\s*<svg[\s>]/i.test(value)) return svgDataUrl(value);
    try {
      return await imageDataUrl(value, runtime.files);
    } catch (error) {
      return `⚠ ${messageOf(error)}`;
    }
  }
}
