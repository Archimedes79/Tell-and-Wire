// Every package this folder installs, held to the licences it may come under.
//
// The same lists and the same rule as ../../scripts/licenses.mjs, read from this
// folder's own lockfile: the root lockfile does not know these packages, and
// nothing here is part of the download or a bundle. Whoever runs this server
// installs them from npm; this check is for the push that brings in one on
// terms the project does not accept.

import { readFileSync } from 'node:fs';

const PERMISSIVE = ['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD'];
const DEVELOPMENT = [...PERMISSIVE, 'CC0-1.0', 'CC-BY-4.0', 'Python-2.0', 'BlueOak-1.0.0'];

/** Whether an SPDX expression holds under *allowed*: one side of an OR, every part of an AND. A mix of the two is left to a person. */
function allowedBy(expression, allowed) {
  const ids = expression.replace(/^\((.*)\)$/, '$1');
  if (/\bAND\b/.test(ids) && /\bOR\b/.test(ids)) return false;
  return /\bOR\b/.test(ids)
    ? ids.split(/\s+OR\s+/).some((id) => allowed.includes(id))
    : ids.split(/\s+AND\s+/).every((id) => allowed.includes(id));
}

const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
const groups = { run: new Map(), development: new Map() };
const refused = [];
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path.includes('node_modules/') || entry.link) continue;
  const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
  const license = typeof entry.license === 'string' ? entry.license : '';
  const group = entry.dev ? 'development' : 'run';
  if (!license || !allowedBy(license, group === 'run' ? PERMISSIVE : DEVELOPMENT)) {
    refused.push(`  ${name} ${entry.version}: ${license || 'no licence given'}${group === 'run' ? '' : ' (a development tool)'}`);
  }
  groups[group].set(license || 'none', (groups[group].get(license || 'none') ?? 0) + 1);
}

const line = (counts) => [...counts].sort((a, b) => b[1] - a[1]).map(([license, n]) => `${license} ${n}`).join(', ');
const total = (counts) => [...counts.values()].reduce((sum, n) => sum + n, 0);
console.log(`What the server runs on (${total(groups.run)} packages): ${line(groups.run)}`);
console.log(`Development only (${total(groups.development)} packages): ${line(groups.development)}`);
if (refused.length) {
  console.error(`\nNot under a licence this project allows (the lists are at the top of mcp/scripts/licenses.mjs):\n${refused.join('\n')}`);
  process.exit(1);
}
console.log('Every one of them under a licence this project allows.');
