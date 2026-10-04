import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { API } from './api.ts';
import { OPERATIONS } from '../../graph/core/protocol.ts';

/**
 * The section "The wrapper" of docs/architecture.md defines the wrapper: its
 * two faces to the outside (the runtime API, the design API) and its one to a
 * graph core (the core protocol). Held to the code, so a route or an operation
 * added without a word there fails here.
 */

const page = readFileSync(new URL('../../docs/architecture.md', import.meta.url), 'utf8');

describe('the wrapper, as docs/architecture.md defines it', () => {
  it('names every route of the API with its method', () => {
    const missing = Object.entries(API).filter(([, route]) => !page.includes(`${route.method} ${route.path}`)).map(([name]) => name);
    expect(missing).toEqual([]);
  });

  it('names every operation of the core protocol, as a row of its table', async () => {
    const protocol = readFileSync(new URL('../../graph/core/protocol.ts', import.meta.url), 'utf8');
    const ops = [...protocol.matchAll(/op: '(\w+)'/g)].map((match) => match[1]);
    expect([...new Set(ops)].sort()).toEqual([...OPERATIONS].sort());
    expect(OPERATIONS.filter((op) => !page.includes(`| \`${op}\``))).toEqual([]);
  });
});
