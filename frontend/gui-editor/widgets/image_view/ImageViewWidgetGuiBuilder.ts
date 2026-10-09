import { ImageViewWidgetRunner } from '../../../../backend/gui-editor/widgets/image_view/ImageViewWidgetRunner.ts';
import { DisplayWidgetGuiBuilder } from '../DisplayWidgetGuiBuilder';
import { ImageIcon } from 'lucide-react';

export class ImageViewWidgetGuiBuilder extends DisplayWidgetGuiBuilder {
  readonly widgetKind = 'image_view';

  // ── Build time ────────────────────────────────────────────────────────────

  readonly label = 'Image';

  paletteEntries() {
    return [{ label: this.label, icon: ImageIcon, also: 'picture photo' }];
  }

  readonly runner = new ImageViewWidgetRunner();

  /** A picture has no text of its own: its size is what there is to say. */
  override textShown(): undefined {
    return undefined;
  }
}
