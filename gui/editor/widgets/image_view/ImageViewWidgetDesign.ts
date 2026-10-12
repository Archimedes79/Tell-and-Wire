import { DisplayWidgetDesign } from '../DisplayWidgetDesign.ts';

export class ImageViewWidgetDesign extends DisplayWidgetDesign {
  /**
   * A path, which the block reads itself. The formats are the ones
   * `imageMediaType` knows -- SVG is not among them.
   */
  override draws(): string {
    return 'an image file path, an http(s) URL or a data URL, or a list of them -- not the picture\'s bytes: '
      + 'the block reads each file and shows the picture. PNG, JPEG, GIF, WebP and BMP are recognised.';
  }
}
