// Starts the server on stdin and stdout. Anything written to stdout that is not
// the protocol breaks it, so the one line this prints goes to stderr.

import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { NAME, VERSION } from './info.ts';
import { PageReader } from './page.ts';
import { RobotsGuard } from './robots.ts';
import { policyFromEnv } from './safeFetch.ts';
import { createServer } from './server.ts';

// A library that logs with console.log would write into the protocol: send it to stderr instead.
console.log = console.error;

const policy = policyFromEnv();
const robots = process.env.TW_WEB_IGNORE_ROBOTS === '1' ? null : new RobotsGuard();
console.error(`${NAME} ${VERSION}: public web only${policy.allowPrivate ? ' (private addresses allowed)' : ''}, robots.txt ${robots ? 'respected' : 'ignored'}`);
await createServer(new PageReader(policy, robots)).connect(new StdioServerTransport());
