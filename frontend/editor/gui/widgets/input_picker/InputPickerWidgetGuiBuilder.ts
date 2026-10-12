import { lazy } from 'react';
import type { GuiWidget } from '../../../document/graph';
import { WidgetGuiBuilder } from '../WidgetGuiBuilder';
import { FolderOpen } from 'lucide-react';

export class InputPickerWidgetGuiBuilder extends WidgetGuiBuilder {
  readonly widgetKind = 'input_picker';

  readonly label = 'File or folder';

  paletteEntries() {
    return [{ label: this.label, icon: FolderOpen, also: 'picker open browse upload' }];
  }

  /** One palette entry for both modes; in a sentence, the one it is in. */
  override called(widget: GuiWidget): string {
    return widget.mode === 'directory' ? 'folder picker' : 'file picker';
  }

  override readonly Panel = lazy(() => import('./InputPickerWidgetPanel'));

  override readonly defaultMode = 'file';

  override readonly firesHint =
    'Picking a file or folder (or Enter in the path box) starts a run at that start point.';

  /**
   * A picker is a source like a start point, with no input port:
   * nothing upstream can feed it, and nothing describes what it holds until a
   * person gives it a default path.
   */
  override missingExample(widget: GuiWidget): boolean {
    return !String(widget.value ?? '').trim();
  }

  /** Room for its caption and its path box beside 📂. One row high: a row is as tall as what is in it needs. */
  protected override defaultSpan() {
    return { w: 8, h: 1 };
  }

  /** Its path, and for a folder the file types it keeps and whether it looks into subfolders. */
  protected override initialSettings(): Partial<GuiWidget> {
    return { value: '', extensions: '', recursive: false };
  }

  /** The field draws its own frame; a card around it would be a box in a box. */
  protected override defaultTone() {
    return 'plain' as const;
  }
}
