// Reading a file or a folder: the start point's and the file-picker block's,
// one behaviour at two levels, implemented once.
//
// A listing is the folder, its file types and whether it looks into
// subfolders -- nothing else. Keeping only some of the files is a code node
// wired in after the listing, like any other choice a graph makes.
import { type Runtime } from './Runtime.ts';
import { fileContent } from './documents.ts';

/**
 * `.md, TXT` -> ['.md', '.txt']: the file types a listing keeps, in lower case
 * because a file's own suffix is compared in lower case. Empty means every file.
 */
export function extensionFilter(raw: string): string[] {
  return raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
    .map((e) => (e.startsWith('.') ? e : `.${e}`));
}

/** The files in the folder *path*, sorted: its subfolders' too when *recursive*, only the file types *extensions* names. */
export function listFolder(
  path: string,
  settings: { recursive: boolean; extensions: string },
  runtime: Runtime,
): Promise<string[]> {
  const extensions = extensionFilter(settings.extensions);
  return runtime.files.list(path, {
    recursive: settings.recursive,
    extensions: extensions.length ? extensions : undefined,
  });
}

/** What a start point or a picker block is set to read. */
export interface Chosen {
  path: string;
  /** A folder, listed; otherwise one file. */
  directory: boolean;
  recursive: boolean;
  extensions: string;
  /** A file: send what is in it -- its path and its content -- rather than only where it is. */
  content: boolean;
}

/**
 * What reading *chosen* hands on: the files of a folder -- a list of paths --,
 * or one file as its path and its content (a document read as its text, a
 * picture as itself), or only its path. With nothing chosen: no files, or null.
 */
export async function readChosen(chosen: Chosen, runtime: Runtime): Promise<unknown> {
  if (!chosen.path) return chosen.directory ? [] : null;
  if (chosen.directory) return listFolder(chosen.path, chosen, runtime);
  const path = runtime.files.resolve(chosen.path);
  return chosen.content ? { path, content: await fileContent(path, runtime.files) } : path;
}
