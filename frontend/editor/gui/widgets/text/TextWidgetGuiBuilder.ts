import { lazy } from 'react';
import { StaticWidgetGuiBuilder } from '../StaticWidgetGuiBuilder';
import TextInPlace from './TextInPlace';
import { AlignLeft, Captions, Heading1 } from 'lucide-react';

/** Prose on the page, rendered as markdown: a heading, a paragraph, a caption. */
export class TextWidgetGuiBuilder extends StaticWidgetGuiBuilder {
  readonly widgetKind = 'text';

  // ── Build time ────────────────────────────────────────────────────────────

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

  /** Typed where it stands, on the page being built. */
  override readonly InlineEditor = TextInPlace;

  /**
   * One row, whatever it is: a heading, a caption, a line or two of a
   * paragraph -- it starts where every other widget starts, with no air above
   * it, and grows as it is written (`TextInPlace`). Three rows for a paragraph
   * stood a tall empty box under its one line.
   */
  protected override defaultSpan() {
    return { w: 16, h: 1 };
  }

  /** Its words, none yet. */
  protected override initialSettings() {
    return { value: '' };
  }
}
