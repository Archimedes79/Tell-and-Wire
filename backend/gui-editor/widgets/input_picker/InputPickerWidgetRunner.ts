import { WidgetRunner, partsSaid, type Sent, type Widget } from '../WidgetRunner.ts';
import { type Runtime } from '../../../../graph/nodes/Runtime.ts';
import { listFolder } from '../../../../graph/nodes/folderListing.ts';
import { fileContent } from '../../../../graph/nodes/documents.ts';

/** What a chosen file is sent as: where it is, and what is in it. */
const FILE_PARTS: NonNullable<Sent['keys']> = {
  path: { type: 'text', description: 'where it is' },
  content: { type: 'text', description: 'what is in it -- a document read as its text' },
};

export interface PickerConfig {
  /** The chosen path. */
  path: string;
  directory: boolean;
  recursive: boolean;
  /** Comma-separated suffixes a directory listing keeps. */
  extensions: string;
  /** A file: send what is in it -- its path and its content -- rather than only where it is. */
  content: boolean;
}

/**
 * Choosing a file or a folder.
 *
 * What it sends is its own to say, as everything a block sends is: a chosen
 * file as its path and its content -- what a node working on it wants --, or
 * only its path, for a node that copies or writes beside it; a folder as its
 * listing -- its file types, its subfolders when asked: the same listing the
 * folder node makes, through the same function, because it is the same
 * behaviour.
 */
export class InputPickerWidgetRunner extends WidgetRunner<PickerConfig> {
  readonly widgetKind = 'input_picker' as const;

  config(widget: Widget): PickerConfig {
    const c = widget.config;
    return {
      path: String(c.value ?? ''),
      directory: c.mode === 'directory',
      recursive: c.recursive === true,
      extensions: String(c.extensions ?? ''),
      content: c.send !== 'path',
    };
  }

  override sends(widget: Widget): Sent {
    const { directory, content } = this.config(widget);
    if (directory) return { type: 'file_path', list: true, description: 'the files of the chosen folder: a list of their paths' };
    if (content) return { type: 'json', keys: FILE_PARTS, main: 'content', description: `the chosen file: ${partsSaid(FILE_PARTS)}` };
    return { type: 'file_path', description: 'the path of the chosen file' };
  }

  override event(): 'change' {
    return 'change';
  }

  override async data(widget: Widget, runtime: Runtime): Promise<unknown> {
    const settings = this.config(widget);
    if (!settings.path) return settings.directory ? [] : null;
    if (settings.directory) return listFolder(settings.path, settings, runtime);
    const path = runtime.files.resolve(settings.path);
    return settings.content ? { path, content: await fileContent(path, runtime.files) } : path;
  }

  /** With nothing chosen it is a question, and this block is who to ask. */
  override runtimeRequirements(widget: Widget) {
    const settings = this.config(widget);
    if (settings.path) return [];
    return [{
      label: widget.label || widget.id,
      kind: (settings.directory ? 'directory' : 'file') as 'directory' | 'file',
      current: '',
    }];
  }

  // ── Build time ────────────────────────────────────────────────────────────

  override graphAuthorNote(): string {
    return 'mode file|directory, value = the path; it fires on a choice made. A file sends {"path", "content"} -- '
      + 'send = "path" sends only the path, for a node that copies or writes beside it; a directory sends the paths of '
      + 'every file in the folder -- extensions (e.g. ".csv, .txt") keeps only those types, recursive: true looks into '
      + 'subfolders too';
  }

  /** What it starts on. */
  override referencedPaths(widget: Widget): string[] {
    const { path } = this.config(widget);
    return path ? [path] : [];
  }
}
