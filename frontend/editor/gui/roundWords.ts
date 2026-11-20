import type { RoundSnapshot } from '../api/client';
import { NOTHING_ARRIVED } from '../../../graph/wiring.ts';

/** Who sent what began a round, in words: a block of the GUI by its name, or one of the senders that are not a block. */
function byWords(by: string, nameOf: (id: string) => string): string {
  switch (by) {
    case 'call': return 'called';
    case 'itself': return 'by itself';
    case 'graph': return 'by the graph above';
    case 'run': return 'in a run of everything';
    case 'gui': return 'by the GUI';
    default: return `from "${nameOf(by)}"`;
  }
}

/**
 * What a round did, said in a line -- what began it, and how many of its
 * nodes ran, stood still with what they made before, had nothing to do, or
 * failed -- and, for each that did not run, why, in the run's own words.
 * Nodes and blocks are called by *nameOf*: the label a person gave them.
 * *stopped* is where the chain gave out: the first node that failed or, where none did, the first that had
 * nothing arriving on a wire it needs. A shut gate, and what waits on it, is the graph doing what it says, and is
 * no place the run stopped. Nothing before the round has ended.
 */
export function roundExplained(
  round: RoundSnapshot | null, nameOf: (nodeId: string) => string = (id) => id,
): { line: string; why: string[]; stopped?: { node: string; why: string } } | null {
  if (!round?.done || !round.result) return null;
  const began = round.started ? `"${nameOf(round.started.event)}", ${byWords(round.started.by, nameOf)}` : 'the whole graph';
  const results = round.result.node_results;
  const ran = results.filter((one) => (one.status === 'success' || one.status === 'partial') && !one.reused).length;
  const reused = results.filter((one) => one.reused).length;
  const held = results.filter((one) => one.held).length;
  const idle = results.filter((one) => one.status === 'skipped' && !one.held).length;
  const failed = results.filter((one) => one.status === 'error').length;
  const parts = [`${ran} node${ran === 1 ? '' : 's'} ran`, reused ? `${reused} reused ${reused > 1 ? 'their' : 'its'} last result` : '', held ? `${held} stood still` : '', idle ? `${idle} had nothing to do` : '', failed ? `${failed} failed` : ''].filter(Boolean);
  const why = results
    .filter((one) => one.status !== 'success' && one.status !== 'partial')
    .map((one) => `${nameOf(one.node_id)}: ${one.error || one.messages?.[0] || one.status}`);
  const broke = results.find((one) => one.status === 'error')
    ?? results.find((one) => one.status === 'skipped' && !!one.messages?.[0]?.startsWith(NOTHING_ARRIVED));
  // An error often begins with the node's name, which the line says already.
  const said = broke ? broke.error || broke.messages?.[0] || '' : '';
  const stopped = broke ? { node: broke.node_id, why: said.startsWith(`${nameOf(broke.node_id)}: `) ? said.slice(nameOf(broke.node_id).length + 2) : said } : undefined;
  return { line: `Last run: ${began} -- ${parts.join(', ')}`, why, ...(stopped ? { stopped } : {}) };
}
