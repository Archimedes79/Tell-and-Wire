import { lazy } from 'react';
import { StaticWidgetGuiBuilder } from '../StaticWidgetGuiBuilder';
import TextInPlace from './TextInPlace';
import { AlignLeft, Captions, Heading1, Heading2 } from 'lucide-react';

/** Prose on the GUI, rendered as markdown: a heading of the first or second level, a paragraph, a caption. */
export class TextWidgetGuiBuilder extends StaticWidgetGuiBuilder {
  readonly widgetKind = 'text';

  readonly label = 'Text';

  paletteEntries() {
    return [
      { mode: 'h1', label: 'Heading 1', icon: Heading1, also: 'title h1 heading' },
      { mode: 'h2', label: 'Heading 2', icon: Heading2, also: 'subtitle h2 heading' },
      { mode: 'body', label: 'Text', icon: AlignLeft, also: 'paragraph markdown body' },
      { mode: 'caption', label: 'Caption', icon: Captions, also: 'small note' },
    ];
  }

  override readonly Panel = lazy(() => import('./TextWidgetPanel'));

  override readonly defaultMode = 'body';

  /** Typed where it stands, on the GUI being built. */
  override readonly InlineEditor = TextInPlace;

  /** Its words, none yet. */
  protected override initialSettings() {
    return { value: '' };
  }
}
