// Where things are in an install, and where a package keeps what is not the project's own.

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The folder the code came in, with its launchers: the one holding `graph/`
 * and `backend/` -- a checkout, the downloadable package, a bundle, which all
 * keep them side by side. Found by name, not counted.
 */
export function installFolder(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!(existsSync(join(dir, 'graph')) && existsSync(join(dir, 'backend'))) && dirname(dir) !== dir) dir = dirname(dir);
  return dir;
}

/**
 * Where a bundle keeps the built gui, beside the project. Not `gui.json`:
 * in a project folder that is the gui itself, its blocks.
 */
export const WEB_DIR = 'web';

/**
 * The gui this checkout built, when it has one: what a bundle carries, what
 * `--serve` serves a graph that brings none, and the editor's Deploy. Looked
 * up rather than passed, because the person writing a bundle should not have
 * to know where a build lands.
 */
export function builtGui(): string | undefined {
  const dist = join(installFolder(), 'frontend', 'dist');
  return existsSync(join(dist, 'runtime.html')) ? dist : undefined;
}
