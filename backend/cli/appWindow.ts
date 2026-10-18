// Showing a tool the way a program is shown.
//
// A tool someone was handed is a program to them, not a web page: a window of
// its own, with no tabs and no address bar, is what makes it look like one. Edge
// and Chrome open an address that way (`--app=<address>`) and are on nearly
// every machine; with neither, the default browser shows the tool in a tab as
// it always did. The editor is not shown like this: it is a page one works in
// beside others.

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

interface Command {
  command: string;
  args: string[];
}

/**
 * The browsers that can open *url* as a window of its own, in the order they are tried, for this system.
 * *exists* answers whether a file is there, and *env* is the environment, so a test needs neither.
 */
export function appWindowCommands(
  url: string, system: NodeJS.Platform, env: NodeJS.ProcessEnv, exists: (path: string) => boolean = existsSync,
): Command[] {
  const app = `--app=${url}`;
  if (system === 'win32') {
    const folders = [env['ProgramFiles(x86)'], env.ProgramFiles, env.LOCALAPPDATA].filter((folder): folder is string => !!folder);
    const found = [['Microsoft', 'Edge', 'Application', 'msedge.exe'], ['Google', 'Chrome', 'Application', 'chrome.exe']]
      .flatMap((parts) => folders.map((folder) => join(folder, ...parts)))
      .filter((path) => exists(path));
    return found.map((command) => ({ command, args: [app] }));
  }
  if (system === 'darwin') {
    return ['Microsoft Edge', 'Google Chrome']
      .filter((name) => exists(`/Applications/${name}.app`))
      .map((name) => ({ command: 'open', args: ['-na', name, '--args', app] }));
  }
  // Elsewhere the commands are looked for on the path, and one that is not there fails to start.
  return ['microsoft-edge', 'google-chrome', 'chromium', 'chromium-browser'].map((command) => ({ command, args: [app] }));
}

/** Whether the program started: false where it is not there, said as an 'error' event and never thrown. */
function started({ command, args }: Command): Promise<boolean> {
  return new Promise((done) => {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: false });
    child.on('error', () => done(false));
    child.on('spawn', () => { child.unref(); done(true); });
  });
}

/**
 * Show *url*: in a window of its own where *asApp* and a browser can, else in the default browser's tab.
 * `TW_WINDOW=tab` asks for the tab; `TW_NO_BROWSER` (CI, a container, a helper another process started) for neither.
 */
export async function show(url: string, asApp: boolean): Promise<void> {
  if (process.env.TW_NO_BROWSER) return;
  if (asApp && process.env.TW_WINDOW !== 'tab') {
    for (const command of appWindowCommands(url, process.platform, process.env)) {
      if (await started(command)) return;
    }
  }
  const command = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  // A headless machine is a fine place to serve from; the URL is printed. A
  // missing opener is not thrown but said as an 'error' event, and unheard that
  // event ended the process -- a container's, which has no xdg-open, at start.
  spawn(command, args, { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
}
