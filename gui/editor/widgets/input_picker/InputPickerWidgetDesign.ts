import { WidgetDesign } from '../WidgetDesign.ts';
import type { Widget } from '../../../widgets/WidgetDefinition.ts';
import type { InputPickerWidgetDefinition } from '../../../widgets/input_picker/InputPickerWidgetDefinition.ts';

export class InputPickerWidgetDesign extends WidgetDesign<InputPickerWidgetDefinition> {
  override graphAuthorNote(): string {
    return 'mode file|directory, value = the path; it fires on a choice made. A file sends {"path", "content"} -- '
      + 'send = "path" sends only the path, for a node that copies or writes beside it; a directory sends the paths of '
      + 'every file in the folder -- extensions (e.g. ".csv, .txt") keeps only those types, recursive: true looks into '
      + 'subfolders too';
  }

  /** What it starts on. */
  override referencedPaths(widget: Widget): string[] {
    const { path } = this.kind.config(widget);
    return path ? [path] : [];
  }
}
