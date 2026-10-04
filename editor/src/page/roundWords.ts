import type { RoundSnapshot } from '@/api/client';

/** Who sent what began a round, in words: a block of the page by its name, or one of the engine's senders. */
function byWords(by: string, nameOf: (id: string) => string): string {
  switch (by) {
    case 'call': return 'called';
    case 'itself': return 'by itself';
    case 'graph': return 'by the graph above';
    case 'run': return 'in a run of everything';
    case 'page': return 'by the page';
    default: return `from "${nameOf(by)}"`;
  }
}

/**
 * What a round did, said in a line -- what began it, and how many of its
 * nodes ran, stood still with what they made before, had nothing to do, or
 * failed -- and, for each that did not run, why, in the run's own words.
 * Nodes and blocks are called by *nameOf*: the label a person gave them.
 * Nothing before the round has ended.
 */
export function roundExplained(round: RoundSnapshot | null, nameOf: (nodeId: string) => string = (id) => id): { line: string; why: string[] } | null {
  if (!round?.done || !round.result) return null;
  const began = round.started ? `"${nameOf(round.started.event)}", ${byWords(round.started.by, nameOf)}` : 'the whole graph';
  const results = round.result.node_results;
  const ran = results.filter((one) => (one.status === 'success' || one.status === 'partial') && !one.reused).length;
  const reused = results.filter((one) => one.reused).length;
  const held = results.filter((one) => one.held).length;
  const idle = results.filter((one) => one.status === 'skipped' && !one.held).length;
  const failed = results.filter((one) => one.status === 'error').length;
  const parts = [`${ran} ran`, reused ? `${reused} reused ${reused > 1 ? 'their' : 'its'} last result` : '', held ? `${held} stood still` : '', idle ? `${idle} had nothing to do` : '', failed ? `${failed} failed` : ''].filter(Boolean);
  const why = results
    .filter((one) => one.status !== 'success' && one.status !== 'partial')
    .map((one) => `${nameOf(one.node_id)}: ${one.error || one.messages?.[0] || one.status}`);
  return { line: `Last round: ${began} -- ${parts.join(', ')}`, why };
}
