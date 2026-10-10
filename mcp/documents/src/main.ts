// Starts the server on stdin and stdout, for the folders given as arguments (or
// listed in TW_DOCS_ROOTS). Anything written to stdout that is not the protocol
// breaks it, so what this says goes to stderr.

import { delimiter } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { DocumentReader } from './documents.ts';
import { UserError } from './errors.ts';
import { NAME, VERSION } from './info.ts';
import { openRoots } from './roots.ts';
import { createServer } from './server.ts';

// A library that logs with console.log would write into the protocol: send it to stderr instead.
console.log = console.error;

/** A whole number from the environment, held between *min* and *max*. */
const number = (name: string, fallback: number, min: number, max: number): number => {
  const given = Number(process.env[name]);
  return process.env[name] && Number.isFinite(given) ? Math.min(max, Math.max(min, Math.trunc(given))) : fallback;
};

const given = [...process.argv.slice(2), ...(process.env.TW_DOCS_ROOTS ?? '').split(delimiter)].filter(Boolean);
if (!given.length) {
  console.error(`${NAME}: no folder given. It reads only inside folders you name: node src/main.ts <folder> [<folder> ...] (or TW_DOCS_ROOTS).`);
  process.exit(1);
}

try {
  const roots = await openRoots(given);
  const limits = { maxBytes: number('TW_DOCS_MAX_BYTES', 50 * 1024 * 1024, 64 * 1024, 500 * 1024 * 1024), maxPages: number('TW_DOCS_MAX_PAGES', 500, 1, 5000) };
  console.error(`${NAME} ${VERSION}: reads .pdf and .docx inside ${roots.length === 1 ? roots[0] : `${roots.length} folders (${roots.join(', ')})`}`);
  await createServer(new DocumentReader(roots, limits)).connect(new StdioServerTransport());
} catch (error) {
  console.error(`${NAME}: ${error instanceof UserError ? error.message : error}`);
  process.exit(1);
}
