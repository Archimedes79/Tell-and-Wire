// Running windows: the notebook hands the windows, as the graph they are, to the host, and runs a window by a round.
//
// What a round of a window brings back depends on what ran before it (`gui/windows/order.ts`), so whoever runs a window runs
// first the ones before it that are not current, one round each, and stops where one does not come to anything. This is the
// notebook's own runner: it starts rounds by the host's routes and waits for each by asking after it, nothing more.

import { call, wordsOf } from './api';
import { compile, useNotebook, type NodeState, type Outcome, type WindowResult } from './store';
import { NO_CHAT, chatsOf, inBlock, outEnd, sentBy, startValue, starterOf } from './values';
import { afterRun, runOrder, type Window } from '../../../gui/editor/windows/windows.ts';
import { withoutWriting } from '../../../graph/editor/handedOn.ts';
import type { RoundSnapshot } from '../../../backend/deployment/host/api.ts';

/** The session the host holds for the open document: asked for again, from nothing, for each document opened (`epoch`). */
let held: { epoch: number; session: string | null } = { epoch: -1, session: null };
/** The round being waited for, to be stopped. */
let current: string | null = null;
let stopping = false;

/** How often a round that goes is asked after, in milliseconds. */
const POLL_MS = 250;
const LOG_LIMIT = 30;

const sleep = (ms: number) => new Promise<void>((over) => { setTimeout(over, ms); });

/** What an input holds now: what was set on the page, else what its window says. */
function heldValue(window: Window, blockId: string): unknown {
  const set = useNotebook.getState().values;
  if (blockId in set) return set[blockId];
  const one = window.inputs.find((input) => inBlock(window, input) === blockId);
  if (one) return startValue(one);
  return chatsOf(window).some((chat) => outEnd(window, chat) === blockId) ? NO_CHAT : undefined;
}

/** Hand the document, as the graph it is, to the host: what a round runs is what is on the page. */
async function hold(): Promise<void> {
  const { doc, graph, path, epoch } = useNotebook.getState();
  if (!doc) return;
  const made = compile(doc, graph);
  const { session } = await call('holdGraph', { graph: withoutWriting(made), path: path || null, session: held.epoch === epoch ? held.session : null });
  held = { epoch, session };
  useNotebook.setState({ graph: made });
}

/** How a round came out, and why it did not come to anything. */
function outcomeOf(round: RoundSnapshot, id: string): { outcome: Outcome; message: string } {
  if (round.cancelled) return { outcome: 'stopped', message: '' };
  // The other windows' nodes are in the round too, and stand idle: only the window's own count.
  const nodes = (round.result?.node_results ?? []).filter((node) => node.node_id === id || node.node_id.startsWith(`${id}_`));
  const failed = nodes.find((node) => node.status === 'error');
  if (round.error || round.result?.status === 'error' || failed) {
    return { outcome: 'failed', message: round.error || round.result?.error || failed?.error || 'It failed.' };
  }
  // A node with nothing to do: an input left empty is a window that did nothing, and the one after it would only be handed that.
  const idle = nodes.find((node) => node.status === 'skipped' && !node.held);
  if (idle) return { outcome: 'empty', message: idle.messages?.[0] ?? 'Nothing arrived, so there was nothing to do.' };
  return { outcome: 'done', message: '' };
}

const nodesOf = (round: RoundSnapshot): Record<string, NodeState> => Object.fromEntries((round.result?.node_results ?? []).map((node) => [node.node_id, {
  status: node.status, message: node.error || node.messages?.[0] || '', inputs: node.inputs, outputs: node.outputs, held: !!node.held, reused: !!node.reused,
}]));

/** One window, as a round: started with what its inputs hold, waited for, and what it made written down. Whether it came to something. */
async function runOne(id: string): Promise<boolean> {
  const { doc } = useNotebook.getState();
  const window = doc?.windows.find((one) => one.id === id);
  if (!doc || !window) return false;
  const session = held.session ?? undefined;
  const { round_id: roundId } = await call('startRound', {
    event: id, by: starterOf(window), session, values: sentBy(window, (blockId) => heldValue(window, blockId)),
  });
  current = roundId;
  let round: RoundSnapshot;
  for (;;) {
    round = await call('round', { id: roundId, session });
    if (round.done) break;
    await sleep(POLL_MS);
  }
  current = null;
  const { outcome, message } = outcomeOf(round, id);
  const view = await call('session', { session });
  const shown: Record<string, unknown> = {};
  for (const out of window.outputs) shown[outEnd(window, out)] = view.shown[outEnd(window, out)];
  const result: WindowResult = { outcome, message, shown, nodes: nodesOf(round) };
  // A chat holds the conversation: what the host settled into it is what the next message is sent with. A message that was not
  // answered stays in hand, to be sent again.
  const talks = Object.fromEntries(chatsOf(window).flatMap((chat) => (outcome === 'done' && view.gui[outEnd(window, chat)] ? [[outEnd(window, chat), view.gui[outEnd(window, chat)]]] : [])));
  useNotebook.setState((state) => ({
    values: { ...state.values, ...talks },
    results: { ...state.results, [id]: result },
    log: [{ id: roundId, window: id, title: window.title, at: Date.now(), outcome, round }, ...state.log].slice(0, LOG_LIMIT),
    ...(outcome === 'done' ? { done: afterRun(doc, state.done, id) } : {}),
  }));
  return outcome === 'done';
}

/** Run window *id*, after the windows before it that are not current. */
export async function runWindow(id: string): Promise<void> {
  const { doc, done, going } = useNotebook.getState();
  if (!doc || going.length) return;
  const order = runOrder(doc, id, done);
  stopping = false;
  useNotebook.setState({ going: order, error: '' });
  try {
    await hold();
    for (const one of order) {
      if (stopping || !(await runOne(one))) break;
    }
  } catch (error) {
    // The host could not be reached, or turned the round down: said on the window that was to run, as a round that failed.
    const failing = order[0];
    useNotebook.setState((state) => ({ results: { ...state.results, [failing]: { outcome: 'failed', message: wordsOf(error, 'It could not be run.'), shown: {}, nodes: {} } } }));
  } finally {
    current = null;
    useNotebook.setState({ going: [] });
  }
}

/** Run every window that is not current, in the order of the page; one that does not come to anything ends it. */
export async function runAll(): Promise<void> {
  for (const window of useNotebook.getState().doc?.windows ?? []) {
    const { done, results } = useNotebook.getState();
    // A chat is run by what is said in it, not by the page.
    if (chatsOf(window).length) continue;
    if (done.ran.has(window.id) && !done.changed.has(window.id) && results[window.id]?.outcome === 'done') continue;
    await runWindow(window.id);
    if (useNotebook.getState().results[window.id]?.outcome !== 'done') return;
  }
}

/** Stop the window running, and the ones waiting behind it. */
export async function stopRuns(): Promise<void> {
  stopping = true;
  if (current) await call('stopRound', { id: current, session: held.session ?? undefined }).catch(() => undefined);
}

/** Forget what the windows made, and what using them left with the host: the notebook is as written again. */
export async function forgetRuns(): Promise<void> {
  const { doc, values } = useNotebook.getState();
  // What was said in a chat goes with the rest.
  const kept = Object.fromEntries(Object.entries(values).filter(([key]) => !doc?.windows.some((window) => chatsOf(window).some((chat) => outEnd(window, chat) === key))));
  useNotebook.setState({ results: {}, values: kept, done: { ran: new Set<string>(), changed: new Set<string>() }, log: [] });
  if (held.session) await call('reset', { session: held.session }).catch(() => undefined);
}
