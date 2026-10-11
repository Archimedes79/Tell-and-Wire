import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { API, GUI_API } from '../deployment/host/api.ts';
import { EDITOR_API } from '../editor/host/api.ts';
import { OPERATIONS } from '../deployment/runtime/protocol.ts';

/**
 * The section "The host" of docs/architecture.md defines the host: its
 * faces to the outside (the runtime API, the editor API) and its one to a
 * graph core (the core protocol). Held to the code, so a route or an operation
 * added without a word there fails here.
 */

const doc = readFileSync(new URL('../../docs/architecture.md', import.meta.url), 'utf8');

describe('the host, as docs/architecture.md defines it', () => {
  it('names every route of the API with its method', () => {
    const missing = Object.entries({ ...API, ...GUI_API, ...EDITOR_API }).filter(([, route]) => !doc.includes(`${route.method} ${route.path}`)).map(([name]) => name);
    expect(missing).toEqual([]);
  });

  it('names every operation of the core protocol, as a row of its table', async () => {
    const protocol = readFileSync(new URL('../deployment/runtime/protocol.ts', import.meta.url), 'utf8');
    const ops = [...protocol.matchAll(/op: '(\w+)'/g)].map((match) => match[1]);
    expect([...new Set(ops)].sort()).toEqual([...OPERATIONS].sort());
    expect(OPERATIONS.filter((op) => !doc.includes(`| \`${op}\``))).toEqual([]);
  });
});
