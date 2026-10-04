import { nameToSave } from '@/dialogs/PathField';

/** The folder *path* is in: all of it before its last part -- '' for a bare name. */
export function folderOf(path: string): string {
  const whole = path.replace(/[\\/]+$/, '');
  return whole.slice(0, Math.max(0, whole.lastIndexOf('/'), whole.lastIndexOf('\\')));
}

/**
 * Where Open's and Save as's file browser opens, and the name Save as starts
 * with, for the path box holding *path*:
 *
 * - a bare name -- a new graph's, or one typed -- in *lastFolder*, the folder
 *   a graph was last opened from or saved to, with that name: read as a
 *   folder, the name opened on "Directory not found: …\untitled_graph";
 * - a path saved to again, in the folder it is in, with its own name: a saved
 *   project's own folder opened, and "Save here" put a project inside it;
 * - a path to open from, there.
 */
export function browseStart(mode: 'load' | 'save', path: string, lastFolder: string, suggested: string): { initialPath: string; defaultName: string } {
  const whole = path.trim().replace(/[\\/]+$/, '');
  if (!/[\\/]/.test(whole)) return { initialPath: lastFolder, defaultName: whole || suggested };
  if (mode === 'save') return { initialPath: folderOf(whole), defaultName: nameToSave(whole) ?? suggested };
  return { initialPath: path, defaultName: suggested };
}
