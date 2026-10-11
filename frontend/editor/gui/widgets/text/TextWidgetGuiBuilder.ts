import { lazy } from 'react';
import { StaticWidgetGuiBuilder } from '../StaticWidgetGuiBuilder';
import TextInPlace from './TextInPlace';
import { AlignLeft, Captions, Heading1 } from 'lucide-react';

/** Prose on the gui, rendered as markdown: a heading, a paragraph, a caption. */
export class TextWidgetGuiBuilder extends StaticWidgetGuiBuilder {
  readonly widgetKind = 'text';

  readonly label = 'Text';

  paletteEntries() {
    return [
      { mode: 'heading', label: 'Heading', icon: Heading1, also: 'title h1' },
      { mode: 'body', label: 'Text', icon: AlignLeft, also: 'paragraph markdown body' },
      { mode: 'caption', label: 'Caption', icon: Captions, also: 'small note' },
    ];
  }

  override readonly Panel = lazy(() => import('./TextWidgetPanel'));

  override readonly defaultMode = 'body';

  /** Typed where it stands, on the gui being built. */
  override readonly InlineEditor = TextInPlace;

  /** Its words, none yet. */
  protected override initialSettings() {
    return { value: '' };
  }
}
