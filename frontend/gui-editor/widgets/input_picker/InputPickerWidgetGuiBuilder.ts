import { lazy } from 'react';
import type { GuiWidget } from '../../../app/graph';
import { WidgetGuiBuilder } from '../WidgetGuiBuilder';
import { FolderOpen } from 'lucide-react';

export class InputPickerWidgetGuiBuilder extends WidgetGuiBuilder {
  readonly widgetKind = 'input_picker';

  // ── Build time ────────────────────────────────────────────────────────────

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

  /**
   * Room for its caption and its path box beside 📂: at 6 wide the designer at
   * 1024 pixels -- cells of 13 pixels there -- drew the path box 18 pixels
   * wide. One row high: a row is as tall as what is in it needs.
   */
  protected override defaultSpan() {
    return { w: 8, h: 1 };
  }

  /** Its path, and for a folder the file types it keeps and whether it looks into subfolders. */
  protected override initialSettings(): Partial<GuiWidget> {
    return { value: '', extensions: '', recursive: false };
  }

  /** A field you operate looks like a field, or nobody clicks it. */
  protected override defaultTone() {
    return 'sunken' as const;
  }
}
