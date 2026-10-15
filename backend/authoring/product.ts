// Switching from one product to the other: find the one that is running, or start it, and say where it is.
//
// The editor and the notebook know each other by this and nothing else -- neither imports the other. A person at one presses "open in the
// editor" or "open in the notebook"; this finds the other where it runs (it asks each port it may have taken, as the launchers' search
// leaves it on the first free of ten), and where none runs, starts it from the same install, as a person would, and waits until it says where it
// serves. It is common to both because both ask it, and no package of a tool carries it.

import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { messageOf } from '../../graph/errors.ts';
import { Refusal, type HandlersOf } from '../deployment/host/http.ts';
import { installFolder } from '../deployment/project/layout.ts';
import type { PRODUCT_API } from './productApi.ts';

export type Product = 'editor' | 'notebook';

/** Where each product starts looking for a port, the page it serves, and the command that starts it, from the install's folder. */
const HOME: Record<Product, { port: number; page: string; command: string[] }> = {
  editor: { port: 8000, page: 'frontend/dist/index.html', command: ['backend/cli/main.ts', '--editor', 'frontend/dist'] },
  notebook: { port: 8100, page: 'frontend/notebook/dist/index.html', command: ['backend/notebook/main.ts'] },
};

/** How many ports in a row a product tries before it says they are all taken (`backend/cli/cli.ts`). */
export const PORTS_TRIED = 10;

/** How long to wait for a port to say who it is, and for a started product to say where it serves, in milliseconds. */
const ASKS_FOR_MS = 600;
const STARTS_WITHIN_MS = 20_000;

/** The product an address says it is, or none: a port nobody listens on, or something that is not one of ours. */
export async function whoIsAt(base: string, fetcher: typeof fetch = fetch): Promise<Product | null> {
  try {
    const answer = await fetcher(`${base}/api/product`, { signal: AbortSignal.timeout(ASKS_FOR_MS) });
    if (!answer.ok) return null;
    const said = (await answer.json()) as { product?: unknown };
    return said.product === 'editor' || said.product === 'notebook' ? said.product : null;
  } catch {
    return null;
  }
}

/** Where *product* runs on this machine, as `http://127.0.0.1:<port>`, or none. */
export async function findProduct(product: Product, who: (base: string) => Promise<Product | null> = whoIsAt): Promise<string | null> {
  const first = HOME[product].port;
  for (let port = first; port < first + PORTS_TRIED; port += 1) {
    const base = `http://127.0.0.1:${port}`;
    if (await who(base) === product) return base;
  }
  return null;
}

/** Whether this install holds *product*: its start file and the page it serves are there (a notebook download has no editor). */
export function installHolds(product: Product, install: string = installFolder()): boolean {
  return existsSync(join(install, HOME[product].command[0])) && existsSync(join(install, HOME[product].page));
}

/** Start *product* from *install* and resolve with the address it says it serves on. It goes on running when this process ends. */
export function startProduct(product: Product, install: string = installFolder()): Promise<string> {
  return new Promise((found, failed) => {
    // What it says goes to a file, not a pipe: a pipe this process closes would end it at its next word. No browser of its own: the person is
    // in one already, and is sent to the address.
    const log = join(mkdtempSync(join(tmpdir(), `tell-and-wire-${product}-`)), 'start.log');
    const fd = openSync(log, 'w');
    const child = spawn(process.execPath, HOME[product].command, {
      cwd: install, detached: true, windowsHide: true, stdio: ['ignore', 'ignore', fd], env: { ...process.env, TW_NO_BROWSER: '1' },
    });
    closeSync(fd);
    const said = (): string => { try { return readFileSync(log, 'utf8'); } catch { return ''; } };
    let ended = false;
    const stop = (): void => { ended = true; clearInterval(watch); clearTimeout(timer); };
    const watch = setInterval(() => {
      const url = /Serving on (http:\/\/\S+)/.exec(said())?.[1];
      if (url && !ended) { stop(); child.unref(); found(url.replace(/\/$/, '')); }
    }, 100);
    const timer = setTimeout(() => { if (ended) return; stop(); child.kill(); failed(new Error(`The ${product} did not say where it serves within ${STARTS_WITHIN_MS / 1000} seconds.`)); }, STARTS_WITHIN_MS);
    child.on('error', (error) => { if (ended) return; stop(); failed(error); });
    child.on('exit', (code) => { if (ended) return; stop(); failed(new Error(`The ${product} ended (${code}) before it served:\n${said().trim()}`)); });
  });
}

/** The address that opens the project at *path* in *product*. */
export const openingAt = (base: string, path: string): string => `${base}/?open=${encodeURIComponent(path)}`;

export interface Switched {
  /** Where to send the person: the other product, asked to open the project. */
  url: string;
  /** It was not running and was started. */
  started: boolean;
}

/**
 * Where the person goes to have the project at *path* open in *product*: where it runs, else where it was started. Refused, in words, by
 * an install that does not hold it.
 */
export async function switchTo(
  product: Product,
  path: string,
  deps: { find?: typeof findProduct; start?: typeof startProduct; holds?: typeof installHolds } = {},
): Promise<Switched> {
  const base = await (deps.find ?? findProduct)(product);
  if (base) return { url: openingAt(base, path), started: false };
  if (!(deps.holds ?? installHolds)(product)) {
    throw new Error(`This install has no ${product}: ${product === 'editor' ? 'it is the notebook download, without the graph editor' : 'its page is not built (npm run build:notebook)'}.`);
  }
  return { url: openingAt(await (deps.start ?? startProduct)(product), path), started: true };
}

/** The routes of `PRODUCT_API` for the product *self*: it answers who it is, and switches to the other one. */
export function productRoutes(self: Product, deps: Parameters<typeof switchTo>[2] & { install?: string } = {}): HandlersOf<typeof PRODUCT_API> {
  const other: Product = self === 'editor' ? 'notebook' : 'editor';
  return {
    product: () => ({ product: self, can_switch: (deps.holds ?? installHolds)(other) }),
    async switchProduct(asked) {
      try {
        return await switchTo(other, asked.path, deps);
      } catch (error) {
        throw new Refusal(502, messageOf(error));
      }
    },
  };
}
