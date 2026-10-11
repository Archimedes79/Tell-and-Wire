import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every file under *dir*, but those in a folder named in *skip* and anything
 * hidden -- a name that starts with a dot -- where no source is.
 *
 * The architecture tests read the source tree while other tests run, and some
 * of those make scratch files and folders in the working directory, which is
 * `backend/`, and remove them again: a hidden name each, so that a folder that
 * is made and gone within a moment, or a link that leads out of the tree, is
 * never looked into. One that vanishes while the folder is read is left out,
 * and a link is not followed.
 */
export function filesUnder(dir: string, skip: readonly string[] = ['node_modules']): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    if (entry.name.startsWith('.')) return [];
    if (entry.isDirectory()) return skip.includes(entry.name) ? [] : filesUnder(join(dir, entry.name), skip);
    return entry.isFile() ? [join(dir, entry.name)] : [];
  });
}
