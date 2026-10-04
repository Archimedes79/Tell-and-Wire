import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Graph, GraphNode } from '../graph.ts';
import type { Runtime } from '../elements/Runtime.ts';
import { RUN_PORT } from '../execution/triggers.ts';
import { edge, graphOf, quietRuntime } from '../../test/fakes.ts';
import { Session, holderOf, type SessionEvent, type SessionOptions } from './session.ts';
import { NotOffered } from '../execution/graphInterface.ts';
import { loadGraph, saveGraph, STATE_FILE, stateFileOf, writeProject } from '../project/folder.ts';
import { folderProblems } from '../project/folderCheck.ts';
import { writeBundle } from '../cli/bundle.ts';

/**
 * A graph in use, and what using it leaves behind: the rules of "State" in
 * docs/architecture.md, held one by one.
 *
 * Bodies run in this process, not the sandbox: what is tested is what a round
 * keeps, not how a body is run.
 */

/** A port, by name; `name:field` takes that one value of what arrives (`Port.field`). */
function port(spec: string, kind: 'input' | 'output') {
  const [name, field] = spec.split(':');
  return { id: name, name, kind, data_type: 'any' as const, multi: false, required: false, description: '', ...(field ? { field } : {}) };
}

function node(id: string, type = 'code', config: Record<string, unknown> = {}, ports: { in?: string[]; out?: string[] } = {}): GraphNode {
  return {
    id, node_type: type as GraphNode['node_type'], label: id, description: '', position: { x: 0, y: 0 },
    config: type === 'code' ? { code: 'function run(inputs) { return inputs; }', ...config } : config,
    inputs: (ports.in ?? []).map((name) => port(name, 'input')),
    outputs: (ports.out ?? []).map((name) => port(name, 'output')),
  };
}

const inProcess: Runtime['code'] = {
  run: async (body, inputs, signal) => {
    // A body named "slow" waits for its Stop, as a model call that never answers would.
    if (body.includes('slow')) await new Promise((stopped) => signal?.addEventListener('abort', stopped));
    return new Function('inputs', `${body}; return run(inputs);`)(inputs) as Record<string, unknown>;
  },
};
const fake: SessionOptions['runtime'] = (report) => quietRuntime({ code: inProcess, report });
const open = (graph: Graph, file?: string) => Session.open(graph, { runtime: fake, file });
const wait = (ms: number) => new Promise((wake) => setTimeout(wake, ms));
const scratch = async () => join(await mkdtemp(join(tmpdir(), 'session-')), 'state.json');
const NOTHING = { nodes: {}, page: {} };

/** A counter: a data node, and a code node adding one to what it holds, around a loop. */
function counter(add = 'function run(i) { return { next: i.n + 1 }; }'): Graph {
  return graphOf(
    [
      node('count', 'data', { data_format: 'structure', data_value: 0 }, { in: ['input'], out: ['output'] }),
      node('add', 'code', { code: add }, { in: ['n'], out: ['next'] }),
    ],
    [edge('n', 'count', 'output', 'add', 'n'), edge('next', 'add', 'next', 'count', 'input')],
  );
}

/**
 * A page with a box that shows what a code node made of a dropdown's choice:
 * choosing fires the start point "picked", which is sent the choice.
 */
function echo(say = 'function run(i) { return { out: "picked " + i.pick }; }'): Graph {
  return {
    ...graphOf(
      [
        node('picked', 'start'),
        node('say', 'code', { code: say }, { in: ['pick:pick'], out: ['out'] }),
        node('said', 'end', {}, { in: ['value'] }),
      ],
      [edge('p', 'picked', 'data', 'say', 'pick'), edge('s', 'say', 'out', 'said', 'value')],
    ),
    page: {
      blocks: [
        { id: 'heading', kind: 'text', value: 'Echo' },
        { id: 'pick', kind: 'select', options: 'a\nb', value: 'a', sends_to: ['picked'], fires: 'picked' },
        { id: 'shown', kind: 'text_io', mode: 'output', shows: 'said' },
      ],
    },
  };
}

const PICKED = { node_id: 'picked', port_id: 'data' };
/** A round the dropdown starts, as the page starts it: by the block, with what the page set. */
const picked = (session: Session, values: Record<string, unknown> = {}) => session.run(PICKED, { values, by: 'pick' });

describe('a session', () => {
  it('keeps what a round leaves, and never in the design it was handed', async () => {
    const design = counter();
    const session = await open(design);
    await session.run(null);
    await session.run(null);
    expect(session.kept()).toEqual({ nodes: { count: { data_value: 2 } }, page: {} });
    expect(design.nodes[0].config.data_value).toBe(0);
    expect(session.graph.nodes[0].config.data_value).toBe(0);
  });

  it('keeps what a block holds by its id, and a heading not at all: that is its design', async () => {
    const session = await open(echo());
    const result = await picked(session);
    expect(result.status).toBe('success');
    expect(session.kept()).toEqual({ nodes: { picked: { values: { pick: 'a' } } }, page: { shown: 'picked a' } });
  });

  it('empties a message once a round has delivered it, and keeps a setting', async () => {
    const graph: Graph = {
      ...graphOf(
        [node('tell', 'start'), node('heard', 'code', {}, { in: ['m:say', 'n:name'], out: ['m', 'n'] })],
        [edge('m', 'tell', 'data', 'heard', 'm'), edge('n', 'tell', 'data', 'heard', 'n')],
      ),
      page: {
        blocks: [
          { id: 'say', kind: 'text_io', mode: 'input', value: 'hello', sends_to: ['tell'], fires: 'tell' },
          { id: 'name', kind: 'text_io', mode: 'input', value: 'Ada', sends_to: ['tell'] },
        ],
      },
    };
    const session = await open(graph);
    const result = await session.run({ node_id: 'tell', port_id: 'data' }, { by: 'say' });
    expect(result.node_results.find((r) => r.node_id === 'heard')!.outputs).toEqual({ m: 'hello', n: 'Ada' });
    expect(session.kept().page).toEqual({ say: '' });
  });

  it('commits nothing of a round that was stopped', async () => {
    const session = await open(counter());
    await session.run(null);
    session.hold(counter('function run(i) { slow; return { next: i.n + 1 }; }'));
    const { id } = session.start(null);
    await wait(30);
    session.stop(id);
    for (let i = 0; i < 50 && !session.snapshot(id)?.done; i += 1) await wait(10);
    expect(session.snapshot(id)).toMatchObject({ done: true, cancelled: true });
    expect(session.kept().nodes).toEqual({ count: { data_value: 1 } });
  });

  it('commits nothing of a round that could not start, and says why', async () => {
    const loop = graphOf(
      [node('a', 'code', {}, { in: ['x'], out: ['y'] }), node('b', 'code', {}, { in: ['y'], out: ['x'] })],
      [edge('ab', 'a', 'y', 'b', 'y'), edge('ba', 'b', 'x', 'a', 'x')],
    );
    const session = await open(loop);
    await expect(session.run(null)).rejects.toThrow(/cycle/i);
    expect(session.kept()).toEqual(NOTHING);
  });

  it('runs one round at a time, whoever asked: the second waits for the first', async () => {
    const session = await open(counter());
    const first = session.start(null);
    const second = session.start(null);
    expect(session.snapshot(second.id)).toMatchObject({ done: false, current_label: 'Waiting for the round before it' });
    for (let i = 0; i < 100 && !session.snapshot(second.id)?.done; i += 1) await wait(10);
    expect(session.snapshot(first.id)).toMatchObject({ done: true, total: 2 });
    // Each started from what the one before it left.
    expect(session.kept().nodes).toEqual({ count: { data_value: 2 } });
  });
});

describe('what began a round', () => {
  it('is said by every snapshot of it: the start point and who sent it -- nothing, for a round of the whole graph', async () => {
    const session = await open(echo());
    const fired = session.start(PICKED, { values: { pick: 'b' }, by: 'pick' });
    expect(session.snapshot(fired.id)?.started).toEqual({ event: 'picked', by: 'pick' });
    await fired.outcome;
    expect(session.snapshot(fired.id)?.started).toEqual({ event: 'picked', by: 'pick' });
    const called = session.start(PICKED, { values: { pick: 'a' } });
    expect(session.snapshot(called.id)?.started).toEqual({ event: 'picked', by: 'call' });
    await called.outcome;
    const whole = session.start(null);
    expect(session.snapshot(whole.id)?.started).toBeNull();
    await whole.outcome;
  });
});

describe('a round the page starts', () => {
  it('is sent what the page set, and keeps it: the session says it back by block, and what the end points handed back', async () => {
    const session = await open(echo());
    await picked(session, { pick: 'b' });
    expect(session.kept()).toEqual({ nodes: { picked: { values: { pick: 'b' } } }, page: { pick: 'b', shown: 'picked b' } });
    // The session says it too, as Start over forgets it.
    expect(session.view().kept).toEqual(session.kept());
    expect(session.view()).toMatchObject({
      sent: { picked: { pick: 'b' } }, page: { pick: 'b', shown: 'picked b' }, outputs: { said: 'picked b' }, shown: { shown: 'picked b' }, rounds: 1, dropped: [],
    });
    // The next round starts from what this one was given.
    await picked(session);
    expect(session.view().outputs).toEqual({ said: 'picked b' });
  });

  it('is refused when the block does not fire the start point, or a value is for a block that takes none', async () => {
    const session = await open(echo());
    expect(() => session.start(PICKED, { by: 'shown' })).toThrow('The block "shown" does not fire "picked"; it is fired by "pick".');
    expect(() => session.start(PICKED, { values: { heading: 'written over' }, by: 'pick' })).toThrow('No block "heading" on the page takes a value.');
    expect(() => session.start(PICKED, { values: { heading: 'written over' }, by: 'pick' })).toThrow(NotOffered);
    expect(session.view().rounds).toBe(0);
  });

  it('keeps nothing of what a stopped round was given', async () => {
    const session = await open(echo('function run(i) { slow; return { out: i.pick }; }'));
    const { id } = session.start(PICKED, { values: { pick: 'b' }, by: 'pick' });
    await wait(30);
    session.stop(id);
    for (let i = 0; i < 50 && !session.snapshot(id)?.done; i += 1) await wait(10);
    expect(session.view().page.pick).toBe('a');
  });

  it('does not show again what an end point was only left holding: a picture is read once', async () => {
    let reads = 0;
    const graph: Graph = {
      ...graphOf(
        [
          node('clock', 'start', { started_by: 'itself', on_start: false, every: '5m' }),
          node('go', 'start'),
          node('flag', 'code', { code: 'function run() { return { open: false }; }' }, { in: ['x'], out: ['open'] }),
          node('reader', 'code', { code: 'function run() { return { pic: "cover.png" }; }' }, { out: ['pic'] }),
          node('picture', 'end', {}, { in: ['value'] }),
        ],
        [
          edge('c', 'clock', 'data', 'reader', RUN_PORT), edge('g', 'go', 'data', 'flag', 'x'),
          edge('f', 'flag', 'open', 'reader', RUN_PORT), edge('p', 'reader', 'pic', 'picture', 'value'),
        ],
      ),
      page: { blocks: [{ id: 'press', kind: 'button', fires: 'go' }, { id: 'img', kind: 'image_view', shows: 'picture' }] },
    };
    const session = await Session.open(graph, {
      runtime: (report) => quietRuntime({ code: inProcess, report, files: { read: async () => { reads += 1; return 'cGljdHVyZQ=='; } } }),
    });
    await session.run({ node_id: 'clock', port_id: 'data' }, { by: 'itself' });
    expect(session.view().shown).toEqual({ img: 'data:image/png;base64,cGljdHVyZQ==' });
    const pressed = await session.run({ node_id: 'go', port_id: 'data' }, { by: 'press' });
    expect(pressed.node_results.find((r) => r.node_id === 'reader')).toMatchObject({ held: true });
    expect(pressed.node_results.find((r) => r.node_id === 'picture')).toMatchObject({ status: 'skipped' });
    expect(reads).toBe(1);
  });
});

describe('a chatbot is a page and a model', () => {
  const chatbot = (): Graph => ({
    ...graphOf(
      [
        node('send', 'start'),
        node('ai', 'ai', { ai_model: 'm' }, { in: ['history:chat.history', 'message:chat.message'], out: ['output'] }),
        node('reply', 'end', {}, { in: ['value'] }),
      ],
      [edge('h', 'send', 'data', 'ai', 'history'), edge('m', 'send', 'data', 'ai', 'message'), edge('r', 'ai', 'output', 'reply', 'value')],
    ),
    page: { blocks: [{ id: 'chat', kind: 'chat', sends_to: ['send'], fires: 'send', shows: 'reply' }] },
  });

  it('remembers the turn, and sends it as history with the next one', async () => {
    const asked: string[] = [];
    const session = await Session.open(chatbot(), {
      runtime: (report) => quietRuntime({ report, ai: { complete: async (request) => { asked.push(request.prompt); return asked.length === 1 ? '4' : '6'; } } }),
    });
    const say = (message: string) => session.run({ node_id: 'send', port_id: 'data' }, { values: { chat: message }, by: 'chat' });
    await say('What is 2+2?');
    // Two inputs, each under its port id: the model can tell the history from the message.
    expect(asked[0]).toBe('history:\n\n\nmessage:\nWhat is 2+2?');
    expect(session.view().page.chat).toEqual({ messages: [{ role: 'user', text: 'What is 2+2?' }, { role: 'assistant', text: '4' }], pending: '' });
    await say('And plus 2?');
    expect(asked[1]).toBe('history:\nUser: What is 2+2?\n\nAssistant: 4\n\nmessage:\nAnd plus 2?');
  });
});

describe('what a session keeps on disk', () => {
  it('goes on after a restart, as the same session, from state.json', async () => {
    const file = await scratch();
    const first = await open(counter(), file);
    await first.run(null);
    await first.run(null);
    const kept = JSON.parse(await readFile(file, 'utf8'));
    expect(kept).toMatchObject({ session: first.id, graph: 't', rounds: 2, slots: { count: { data_value: { value: 2, default: 0 } } } });

    const second = await open(counter(), file);
    expect(second.id).toBe(first.id);
    expect(second.dropped).toEqual([]);
    await second.run(null);
    expect(second.kept().nodes).toEqual({ count: { data_value: 3 } });
  });

  it('keeps the page as well: what a block holds and what it shows', async () => {
    const file = await scratch();
    await picked(await open(echo(), file), { pick: 'b' });
    const second = await open(echo(), file);
    expect(second.kept().page).toEqual({ pick: 'b', shown: 'picked b' });
    expect(second.view().shown).toEqual({ shown: 'picked b' });
  });

  it('keeps no file for a graph that has no place for one', async () => {
    const session = await open(counter());
    await session.run(null);
    expect(session.kept().nodes).toEqual({ count: { data_value: 1 } });
  });

  it('is emptied by a reset, file and all: the graph is as it was designed again', async () => {
    const file = await scratch();
    const session = await open(echo(), file);
    await picked(session, { pick: 'b' });
    expect(existsSync(file)).toBe(true);
    await session.reset();
    expect(existsSync(file)).toBe(false);
    expect(session.kept()).toEqual(NOTHING);
    expect(session.view()).toMatchObject({ page: { pick: 'a', shown: null }, shown: {}, outputs: {} });
    await picked(session);
    expect(session.kept().page).toEqual({ shown: 'picked a' });
  });

  it('waits for the round going before it resets, so that round cannot write over the reset', async () => {
    const session = await open(counter());
    session.start(null);
    await session.reset();
    expect(session.kept()).toEqual(NOTHING);
  });

  it('starts with nothing kept from a file it cannot read, and says so', async () => {
    const file = await scratch();
    await writeFile(file, '{ not json');
    const session = await open(counter(), file);
    expect(session.kept()).toEqual(NOTHING);
    expect(session.dropped).toEqual([expect.stringMatching(/could not be read/)]);
  });

  it('is not the project\'s: a save and a check leave state.json alone, and a bundle never carries it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'session-project-'));
    await writeProject(dir, counter());
    const session = await open(await loadGraph(dir), stateFileOf(dir));
    await session.run(null);
    await saveGraph(dir, await loadGraph(dir));
    expect(existsSync(join(dir, STATE_FILE))).toBe(true);
    expect(await folderProblems(dir)).toEqual([]);
    const bundle = await mkdtemp(join(tmpdir(), 'session-bundle-'));
    expect(await writeBundle(await loadGraph(dir), bundle, { dataFrom: dir })).not.toContain(STATE_FILE);
  });
});

describe('the document the editor hands over', () => {
  const file = async (name: string) => join(await mkdtemp(join(tmpdir(), 'session-document-')), name);
  const roundsIn = async (path: string) => (JSON.parse(await readFile(stateFileOf(path), 'utf8')) as { rounds: number }).rounds;

  it('keeps its session when it is saved for the first time: what using it left goes into the file beside it', async () => {
    // It was lost to the first save: a chat, used in the App tab and then saved, began again.
    const holder = holderOf(null, { runtime: fake });
    const session = await holder.hold(counter());
    await session.run(null);
    const saved = await file('counter.json');
    expect(await holder.hold(counter(), { path: saved, session: session.id })).toBe(session);
    expect(session.kept().nodes).toEqual({ count: { data_value: 1 } });
    expect(await roundsIn(saved)).toBe(1);
  });

  it('moves its state along when saved as another file, and leaves the one it was kept in before as it was', async () => {
    const holder = holderOf(null, { runtime: fake });
    const before = await file('a.json');
    const session = await holder.hold(counter(), { path: before });
    await session.run(null);
    const after = await file('b.json');
    await holder.hold(counter(), { path: after, session: session.id });
    await session.run(null);
    expect(await roundsIn(after)).toBe(2);
    expect(await roundsIn(before)).toBe(1);
  });

  it('is a session of its own when it is another document, going on from that one\'s file', async () => {
    const holder = holderOf(null, { runtime: fake });
    const path = await file('a.json');
    const first = await holder.hold(counter(), { path });
    await first.run(null);
    const other = await holder.hold(counter());
    expect(other).not.toBe(first);
    expect(other.kept()).toEqual(NOTHING);
    const back = await holder.hold(counter(), { path });
    expect(back.kept().nodes).toEqual({ count: { data_value: 1 } });
  });

  it('is given a session of its own when another editor took the server meanwhile, and writes nothing into that one', async () => {
    // Two editors on one server: the second's document went into the first's
    // session, and its state into the first one's project.
    const holder = holderOf(null, { runtime: fake });
    const mine = await file('mine.json');
    const theirs = await file('theirs.json');
    const first = await holder.hold(counter(), { path: mine });
    await first.run(null);
    await holder.hold(counter('function run(i) { return { next: i.n + 10 }; }'), { path: theirs });
    const again = await holder.hold(counter(), { path: mine, session: first.id });
    expect(again).not.toBe(first);
    // From its own file: the same session, as a restarted server's would be.
    expect(again.id).toBe(first.id);
    expect(again.kept().nodes).toEqual({ count: { data_value: 1 } });
    await again.run(null);
    expect(await roundsIn(mine)).toBe(2);
    expect(existsSync(stateFileOf(theirs))).toBe(false);
  });

  it('is followed on the stream as the session it is now: a page open on the server hears the switch', async () => {
    const holder = holderOf(null, { runtime: fake });
    const told: SessionEvent[] = [];
    holder.watch((event) => told.push(event));
    const first = await holder.hold(counter());
    await first.run(null);
    const second = await holder.hold(counter());
    await second.run(null);
    const sessions = told.flatMap((event) => (event.type === 'session' ? [event.session.session] : []));
    expect(sessions).toContain(first.id);
    expect(sessions[sessions.length - 1]).toBe(second.id);
    // And told nothing more of the one before.
    await first.run(null);
    expect(told.flatMap((event) => (event.type === 'session' ? [event.session.session] : [])).slice(sessions.length)).not.toContain(first.id);
  });
});

describe('a design that changed', () => {
  it('drops what a node that is gone kept, and says so', async () => {
    const session = await open(counter());
    await session.run(null);
    const without = counter();
    without.nodes = without.nodes.filter((one) => one.id !== 'count');
    without.edges = [];
    expect(session.hold(without)).toEqual(['What "count" kept was dropped: it is no longer in the graph.']);
    expect(session.kept()).toEqual(NOTHING);
  });

  it('treats a renamed node as one gone and one new: nothing is guessed', async () => {
    const session = await open(counter());
    await session.run(null);
    const renamed = counter();
    renamed.nodes[0].id = 'tally';
    renamed.edges = [edge('n', 'tally', 'output', 'add', 'n'), edge('next', 'add', 'next', 'tally', 'input')];
    expect(session.hold(renamed)).toEqual(['What "count" kept was dropped: it is no longer in the graph.']);
    await session.run(null);
    expect(session.kept().nodes).toEqual({ tally: { data_value: 1 } });
  });

  it('drops what a block that is gone held, and what one held whose design changed', async () => {
    const session = await open(echo());
    await picked(session, { pick: 'b' });
    const changed = echo();
    changed.page!.blocks = changed.page!.blocks.filter((block) => block.id !== 'shown');
    changed.page!.blocks[1].value = 'b';
    expect(session.hold(changed)).toEqual([
      'What the block "pick" held was dropped: its design changed.',
      'What the block "shown" held was dropped: it is no longer on the page.',
    ]);
    expect(session.kept().page).toEqual({});
  });

  it('wins over what was kept: a slot whose design changed starts from the design again', async () => {
    const file = await scratch();
    const session = await open(counter(), file);
    await session.run(null);
    const restarted = counter();
    restarted.nodes[0].config.data_value = 10;
    expect(session.hold(restarted)).toEqual(['What "count" kept in "data_value" was dropped: its design changed.']);
    await session.run(null);
    expect(session.kept().nodes).toEqual({ count: { data_value: 11 } });

    // The same is said when the design changed while the tool was not running.
    const reopened = await open(counter(), file);
    expect(reopened.dropped).toEqual(['What "count" kept in "data_value" was dropped: its design changed.']);
  });

  it('keeps what a design that changed elsewhere has no quarrel with', async () => {
    const session = await open(counter());
    await session.run(null);
    const relabelled = counter();
    relabelled.nodes[1].label = 'Add one';
    expect(session.hold(relabelled)).toEqual([]);
    expect(session.kept().nodes).toEqual({ count: { data_value: 1 } });
  });
});

describe('a round a call starts', () => {
  const ask = { node_id: 'ask', port_id: 'data' };
  const topic = () => graphOf(
    [node('ask', 'start', { started_by: 'call' }), node('say', 'code', {}, { in: ['t:topic'], out: ['t'] })],
    [edge('t', 'ask', 'data', 'say', 't')],
  );

  it('sends its start point what it is sent, and keeps it: the session says it back under the start point\'s name', async () => {
    const session = await open(topic());
    const result = await session.run(ask, { values: { topic: 'dogs' } });
    expect(result.node_results.find((r) => r.node_id === 'say')!.outputs).toEqual({ t: 'dogs' });
    expect(session.kept().nodes).toEqual({ ask: { values: { topic: 'dogs' } } });
    expect(session.view().sent).toEqual({ ask: { topic: 'dogs' } });
  });

  it('refuses values for a round of the whole graph before anything starts: no start point takes them', async () => {
    const session = await open(echo());
    expect(() => session.start(null, { values: { nobody: 1 } })).toThrow(NotOffered);
    expect(session.view().rounds).toBe(0);
  });
});

describe('whoever watches a session', () => {
  it('is told each round as it is asked for and as it ends -- with its outputs by name -- and the session after it commits', async () => {
    const session = await open(echo());
    const told: SessionEvent[] = [];
    const stop = session.watch((event) => told.push(event));
    await picked(session, { pick: 'b' });
    await wait(10);
    stop();
    const rounds = told.flatMap((event) => (event.type === 'round' ? [event.round] : []));
    expect(rounds[0]).toMatchObject({ done: false, current_label: 'Waiting for the round before it' });
    expect(rounds.at(-1)).toMatchObject({ done: true, outputs: { said: 'picked b' } });
    expect(told.find((event) => event.type === 'session')).toMatchObject({ session: { page: { pick: 'b' }, outputs: { said: 'picked b' } } });
    await picked(session);
    expect(told.length).toBe(rounds.length + 1);                    // told nothing once it stopped listening
  });

  it('is told the session again when the design it holds changed -- and not when it is handed the same one', async () => {
    const session = await open(echo());
    const told: SessionEvent[] = [];
    session.watch((event) => told.push(event));
    session.hold(echo());
    expect(told).toEqual([]);
    const changed = echo();
    changed.metadata.name = 'Echo, renamed';
    session.hold(changed);
    expect(told).toEqual([{ type: 'session', session: expect.objectContaining({ design_revision: 1 }) }]);
    expect(session.view().design_revision).toBe(1);
  });

  it('is told the session again when a reset emptied it', async () => {
    const session = await open(echo());
    await picked(session, { pick: 'b' });
    await wait(10);                                                 // the round's end is told once it has ended
    const told: SessionEvent[] = [];
    session.watch((event) => told.push(event));
    await session.reset();
    expect(told).toEqual([{ type: 'session', session: expect.objectContaining({ page: { pick: 'a', shown: null }, outputs: {}, rounds: 0 }) }]);
  });
});

describe('the application a session runs', () => {
  /** A counter its start point starts: at start, and on its clock when it has an interval. */
  function clocked(start: Record<string, unknown>): Graph {
    return graphOf(
      [
        node('tick', 'start', start, { out: ['data'] }),
        node('count', 'data', { data_format: 'structure', data_value: 0 }, { in: ['input'], out: ['output'] }),
        node('add', 'code', { code: 'function run(i) { return { next: i.n + 1 }; }' }, { in: ['n'], out: ['next'] }),
      ],
      [edge('n', 'count', 'output', 'add', 'n'), edge('next', 'add', 'next', 'count', 'input'), edge('go', 'tick', 'data', 'add', RUN_PORT)],
    );
  }
  const counted = (session: Session) => (session.kept().nodes.count?.data_value as number | undefined) ?? 0;

  it('starts a start point set to start when the tool starts, and answers once that round has run', async () => {
    const session = await open(clocked({ started_by: 'itself', on_start: true }));
    expect(await session.startApplication()).toEqual({ ticks: false });
    expect(session.kept().nodes).toEqual({ count: { data_value: 1 } });
    expect(session.view().clock).toMatchObject({ running: true, ticks: false, next_at: null });
    await session.stopApplication();
    expect(session.view().clock.running).toBe(false);
  });

  it('keeps the clock of a start point with an interval, until it is stopped', async () => {
    const session = await open(clocked({ started_by: 'itself', on_start: false, every: '0.05' }));
    expect(await session.startApplication()).toEqual({ ticks: true });
    expect(session.view().clock.next_at).not.toBeNull();
    for (let i = 0; i < 100 && counted(session) < 2; i += 1) await wait(20);
    await session.stopApplication();
    const after = counted(session);
    expect(after).toBeGreaterThanOrEqual(2);
    await wait(150);
    expect(counted(session)).toBe(after);
  });

  it('says an interval nobody can read, rather than run on a guess', async () => {
    const session = await open(clocked({ started_by: 'itself', on_start: false, every: 'every so often' }));
    expect(await session.startApplication()).toEqual({ ticks: false });
    expect(session.view().clock.problem).toMatch(/Not an interval/);
    await session.stopApplication();
  });
});

describe('what a round asks before it runs', () => {
  /** A file picker that sends its path to "go", and a button that fires it. */
  const picking = (): Graph => ({
    ...graphOf([node('go', 'start'), node('read', 'code', {}, { in: ['f:file'], out: ['f'] })], [edge('f', 'go', 'data', 'read', 'f')]),
    page: { blocks: [{ id: 'file', kind: 'input_picker', label: 'File', send: 'path', sends_to: ['go'] }, { id: 'press', kind: 'button', fires: 'go' }] },
  });
  const go = { node_id: 'go', port_id: 'data' };

  it('is nothing for a round no page starts: whoever calls sends what it needs', async () => {
    const session = await open(picking());
    expect(session.requirements(go)).toEqual([]);
    expect(session.requirements(null)).toEqual([]);
  });

  it('asks, for a round the page starts, what the blocks that send to its start point ask', async () => {
    const graph: Graph = {
      ...graphOf([node('go', 'start'), node('read', 'code', {}, { in: ['f:file'], out: ['f'] })], [edge('f', 'go', 'data', 'read', 'f')]),
      page: { blocks: [{ id: 'file', kind: 'input_picker', label: 'File', sends_to: ['go'] }, { id: 'press', kind: 'button', fires: 'go' }] },
    };
    const session = await open(graph);
    const go = { node_id: 'go', port_id: 'data' };
    expect(session.requirements(go, { by: 'press' })).toEqual([{ key: 'file', label: 'File', kind: 'file', current: '' }]);
    expect(session.requirements(go, { values: { file: 'a.txt' }, by: 'press' })).toEqual([]);
    expect(session.requirements(go, { answers: { file: 'a.txt' }, by: 'press' })).toEqual([]);
  });

  it('takes an answer into the block that asked, and refuses one to a question nobody asked', async () => {
    const session = await open(picking());
    expect(session.requirements(go, { by: 'press' }).map((asked) => asked.key)).toEqual(['file']);
    const result = await session.run(go, { answers: { file: 'a.txt' }, by: 'press' });
    expect(result.node_results.find((r) => r.node_id === 'read')!.outputs).toEqual({ f: 'a.txt' });
    expect(session.kept().page).toEqual({ file: 'a.txt' });
    expect(() => session.start(go, { answers: { nobody: 1 }, by: 'press' })).toThrow('Nothing asked "nobody": this round asks "file".');
    expect(() => session.start(go, { answers: { nobody: 1 } })).toThrow(NotOffered);
  });
});

/**
 * The ◆ through a session: the rounds of `execution/gates.test.ts`, each a
 * round of one session rather than a run handed one latch. A round's latch is
 * committed when it ends; these hold that a gate behaves as it did.
 */
describe('a gate, round by round', () => {
  /** Read → Summarize: the Read button fires "read", choosing a length fires "length" and is sent with it. */
  function reader(length = 'short', read = 'function run() { return { text: "the file" }; }'): Graph {
    return {
      ...graphOf(
        [
          node('read', 'start'),
          node('length', 'start'),
          node('reader', 'code', { code: read }, { out: ['text'] }),
          node('summary', 'code', { code: 'function run(i) { return { out: i.length + ": " + i.text }; }' }, { in: ['text', 'length:length'], out: ['out'] }),
          node('summed', 'end', {}, { in: ['value'] }),
        ],
        [
          edge('gate', 'read', 'data', 'reader', RUN_PORT),
          edge('text', 'reader', 'text', 'summary', 'text'),
          edge('len', 'length', 'data', 'summary', 'length'),
          edge('show', 'summary', 'out', 'summed', 'value'),
        ],
      ),
      page: {
        blocks: [
          { id: 'read', kind: 'button', label: 'Read', fires: 'read' },
          { id: 'length', kind: 'select', options: 'short\nlong', value: length, sends_to: ['length'], fires: 'length' },
          { id: 'shown', kind: 'text_io', mode: 'output', shows: 'summed' },
        ],
      },
    };
  }
  const READ = { node_id: 'read', port_id: 'data' };
  const LENGTH = { node_id: 'length', port_id: 'data' };

  it('stays shut for another event, and what the node made in an earlier round stands', async () => {
    const session = await open(reader());
    await session.run(READ, { by: 'read' });
    session.hold(reader('long'));
    const run = await session.run(LENGTH, { by: 'length' });
    expect(run.node_results.find((r) => r.node_id === 'reader')).toMatchObject({ status: 'skipped', held: true, outputs: { text: 'the file' } });
    expect(session.kept().page).toEqual({ shown: 'long: the file' });
  });

  it('holds nothing a stopped round made', async () => {
    const session = await open(reader());
    session.hold(reader('short', 'function run() { slow; return { text: "the file" }; }'));
    const { id } = session.start(READ, { by: 'read' });
    await wait(30);
    session.stop(id);
    for (let i = 0; i < 50 && !session.snapshot(id)?.done; i += 1) await wait(10);
    session.hold(reader());
    const run = await session.run(LENGTH, { by: 'length' });
    expect(run.node_results.find((r) => r.node_id === 'reader')).toMatchObject({ status: 'skipped', outputs: {} });
    expect(run.node_results.find((r) => r.node_id === 'reader')!.held).toBeUndefined();
  });

  it('is remembered across a restart', async () => {
    const file = await scratch();
    const first = await open(reader(), file);
    await first.run(READ, { by: 'read' });
    const second = await open(reader('long'), file);
    const run = await second.run(LENGTH, { by: 'length' });
    expect(run.node_results.find((r) => r.node_id === 'reader')).toMatchObject({ held: true, outputs: { text: 'the file' } });
    expect(run.node_results.find((r) => r.node_id === 'summary')).toMatchObject({ outputs: { out: 'long: the file' } });
  });

  it('remembers a data node across rounds though settling changes its config', async () => {
    const graph: Graph = {
      ...graphOf(
        [
          node('read', 'start'),
          node('length', 'start'),
          node('reader', 'code', { code: 'function run() { return { text: "the file" }; }' }, { out: ['text'] }),
          node('keep', 'data', { data_value: '' }, { in: ['input'], out: ['output'] }),
          node('summary', 'code', { code: 'function run(i) { return { out: i.length + ": " + i.text }; }' }, { in: ['text', 'length:length'], out: ['out'] }),
        ],
        [
          edge('gate', 'read', 'data', 'reader', RUN_PORT),
          edge('a', 'reader', 'text', 'keep', 'input'),
          edge('b', 'keep', 'output', 'summary', 'text'),
          edge('c', 'length', 'data', 'summary', 'length'),
        ],
      ),
      page: {
        blocks: [
          { id: 'read', kind: 'button', fires: 'read' },
          { id: 'length', kind: 'select', options: 'short\nlong', value: 'short', sends_to: ['length'], fires: 'length' },
        ],
      },
    };
    const session = await open(graph);
    await session.run(READ, { by: 'read' });
    const second = await session.run(LENGTH, { by: 'length' });
    expect(second.node_results.find((r) => r.node_id === 'reader')).toMatchObject({ held: true });
    expect(second.node_results.find((r) => r.node_id === 'summary')).toMatchObject({ status: 'success', outputs: { out: 'short: the file' } });
  });
});

describe('a session whose rounds run in a graph core of its own process', () => {
  it('runs them there, keeps what the nodes keep here, and lets the core go when it closes', async () => {
    const { processCore } = await import('../core/stdio.ts');
    const { fileURLToPath } = await import('node:url');
    const project = fileURLToPath(new URL('../../../examples/nested_statistics', import.meta.url));
    const main = fileURLToPath(new URL('../main.ts', import.meta.url));
    const session = await Session.open(await loadGraph(project), { core: () => processCore(process.execPath, [main, 'core']) });
    try {
      const result = await session.run({ node_id: 'measure', port_id: 'data' }, { values: { paragraph: 'One two three. Four five.' } });
      expect(result.status).toBe('success');
      const view = session.view();
      expect(view.outputs).toMatchObject({ report: expect.objectContaining({ words: 5, sentences: 2 }) });
      // What the start point was sent is kept by the session, not by the core.
      expect(view.sent.measure).toEqual({ paragraph: 'One two three. Four five.' });
    } finally {
      await session.close();
    }
  }, 30_000);
});

describe('a round at a start point, before it runs', () => {
  it('says how many nodes it runs: the slice its start point reaches, not the whole graph', async () => {
    // The review: the slice was left to the core, and a round queued behind another said "0/3" for "0/2".
    const graph = graphOf([
      node('go', 'start', { started_by: 'call' }, { out: ['data'] }),
      node('a', 'code', {}, { in: ['x'], out: ['y'] }),
      node('b', 'code', {}, { in: ['x'], out: ['y'] }),
    ], [edge('e', 'go', 'data', 'a', 'x')]);
    const session = await open(graph);
    const { total, outcome } = session.start({ node_id: 'go', port_id: 'data' }, { values: {} });
    expect(total).toBe(2);
    await outcome;
    await session.close();
  });
});
