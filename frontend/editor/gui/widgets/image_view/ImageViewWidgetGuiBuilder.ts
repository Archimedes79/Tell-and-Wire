import { DisplayWidgetGuiBuilder } from '../DisplayWidgetGuiBuilder';
import { ImageIcon } from 'lucide-react';

export class ImageViewWidgetGuiBuilder extends DisplayWidgetGuiBuilder {
  readonly widgetKind = 'image_view';

  readonly label = 'Image';

  paletteEntries() {
    return [{ label: this.label, icon: ImageIcon, also: 'picture photo' }];
  }

  /** A picture has no text of its own: its size is what there is to say. */
  override textShown(): undefined {
    return undefined;
  }

  /** What a run shows is a card, like the other results on the page. */
  protected override defaultTone() {
    return 'raised' as const;
  }
}
