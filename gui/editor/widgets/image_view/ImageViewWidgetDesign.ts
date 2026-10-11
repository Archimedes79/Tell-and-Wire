import { DisplayWidgetDesign } from '../DisplayWidgetDesign.ts';

export class ImageViewWidgetDesign extends DisplayWidgetDesign {
  /**
   * A path, which the block reads itself. The formats are the ones
   * `imageMediaType` knows; the editor said SVG as well, which a run refuses.
   */
  override draws(): string {
    return 'an image file path, an http(s) URL or a data URL, or a list of them -- not the picture\'s bytes: '
      + 'the block reads each file and shows the picture. PNG, JPEG, GIF, WebP and BMP are recognised.';
  }
}
