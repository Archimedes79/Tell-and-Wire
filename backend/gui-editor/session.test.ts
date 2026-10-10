import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Graph, GraphNode } from '../../graph/graph.ts';
import type { Runtime } from '../../graph/nodes/Runtime.ts';
import { RUN_PORT } from '../../graph/execution/triggers.ts';
import { edge, graphOf, quietRuntime } from '../../graph/test/fakes.ts';
import { Session, holderOf, type SessionOptions } from './session.ts';
import { NotOffered } from './graphInterface.ts';
import { loadGraph, saveGraph, STATE_FILE, stateFileOf, writeProject } from '../app/project/folder.ts';
import { folderProblems } from '../app/project/folderCheck.ts';
import { writeBundle } from '../app/cli/bundle.ts';

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
      node('count', 'data', { data_value: { total: 0 } }),
      node('add', 'code', { code: add }, { in: ['n:total'], out: ['next'] }),
    ],
    [edge('n', 'count', 'before', 'add', 'n'), edge('next', 'add', 'next', 'count', 'total')],
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

describe('state', () => {
  it('is what a round leaves, kept in the session and never in the design it was handed', async () => {
    const design = counter();
    const session = await open(design);
    await session.run(null);
    await session.run(null);
    expect(session.kept()).toEqual({ nodes: { count: { total: 2, round: 2 } }, page: {} });
    expect(design.nodes[0].config.data_value).toEqual({ total: 0 });
    expect(session.graph.nodes[0].config.data_value).toEqual({ total: 0 });
  });

  it('lists what each memory node holds, by name and whole -- from its design on, with no round -- and a block of the page shows it', async () => {
    const session = await open({ ...counter(), page: { blocks: [{ id: 'total', kind: 'text_io', mode: 'output', shows: 'count' }] } });
    expect(session.view()).toMatchObject({ state: { count: { total: 0 } }, shown: { total: { total: 0 } } });
    await session.run(null);
    await session.run(null);
    expect(session.view()).toMatchObject({ state: { count: { total: 2 } }, shown: { total: { total: 2 } } });
  });

  it('is committed only by a round that ran to its end: a stopped one or one that could not start commits nothing', async () => {
    const session = await open(counter());
    await session.run(null);
    session.hold(counter('function run(i) { slow; return { next: i.n + 1 }; }'));
    const { id } = session.start(null);
    await wait(30);
    session.stop(id);
    for (let i = 0; i < 50 && !session.snapshot(id)?.done; i += 1) await wait(10);
    expect(session.snapshot(id)).toMatchObject({ done: true, cancelled: true });
    expect(session.kept().nodes).toEqual({ count: { total: 1, round: 1 } });

    const loop = graphOf(
      [node('a', 'code', {}, { in: ['x'], out: ['y'] }), node('b', 'code', {}, { in: ['y'], out: ['x'] })],
      [edge('ab', 'a', 'y', 'b', 'y'), edge('ba', 'b', 'x', 'a', 'x')],
    );
    const stuck = await open(loop);
    await expect(stuck.run(null)).rejects.toThrow(/cycle/i);
    expect(stuck.kept()).toEqual(NOTHING);
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

  it('goes on after a restart, as the same session, from state.json: the nodes\' kept values and the page\'s blocks', async () => {
    const file = await scratch();
    const first = await open(counter(), file);
    await first.run(null);
    await first.run(null);
    const second = await open(counter(), file);
    expect(second.id).toBe(first.id);
    expect(second.dropped).toEqual([]);
    await second.run(null);
    expect(second.kept().nodes).toEqual({ count: { total: 3, round: 3 } });

    const pageFile = await scratch();
    await picked(await open(echo(), pageFile), { pick: 'b' });
    const again = await open(echo(), pageFile);
    expect(again.kept().page).toEqual({ pick: 'b', shown: 'picked b' });
    expect(again.view().shown).toEqual({ shown: 'picked b' });
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

describe('a design that changed', () => {
  it('wins over what was kept: a value whose design changed starts from the design again, one it did not touch -- the round count -- stays', async () => {
    const file = await scratch();
    const session = await open(counter(), file);
    await session.run(null);
    // Where a node is drawn is no design: dragging one does not make a page draw itself again.
    const dragged = counter();
    dragged.nodes[1].position = { x: 400, y: 80 };
    session.hold(dragged);
    expect(session.designRevision).toBe(0);
    const relabelled = counter();
    relabelled.nodes[1].label = 'Add one';
    expect(session.hold(relabelled)).toEqual([]);
    expect(session.designRevision).toBe(1);
    expect(session.kept().nodes).toEqual({ count: { total: 1, round: 1 } });

    const restarted = counter();
    restarted.nodes[0].config.data_value = { total: 10 };
    expect(session.hold(restarted)).toEqual(['What "count" kept in "total" was dropped: its design changed.']);
    await session.run(null);
    expect(session.kept().nodes).toEqual({ count: { total: 11, round: 2 } });

    // The same is said when the design changed while the tool was not running.
    const reopened = await open(counter(), file);
    expect(reopened.dropped).toEqual(['What "count" kept in "total" was dropped: its design changed.']);
  });

  it('drops, and says, what a node or a block that is gone kept', async () => {
    const session = await open(counter());
    await session.run(null);
    const without = counter();
    without.nodes = without.nodes.filter((one) => one.id !== 'count');
    without.edges = [];
    expect(session.hold(without)).toEqual(['What "count" kept was dropped: it is no longer in the graph.']);
    expect(session.kept()).toEqual(NOTHING);

    const paged = await open(echo());
    await picked(paged, { pick: 'b' });
    const changed = echo();
    changed.page!.blocks = changed.page!.blocks.filter((block) => block.id !== 'shown');
    changed.page!.blocks[1].value = 'b';
    expect(paged.hold(changed)).toEqual([
      'What the block "pick" held was dropped: its design changed.',
      'What the block "shown" held was dropped: it is no longer on the page.',
    ]);
    expect(paged.kept().page).toEqual({});
  });
});

describe('a round the page starts', () => {
  it('is sent what the page set and keeps it, and is refused for a block that does not fire the start point or a value no block takes', async () => {
    const session = await open(echo());
    await picked(session, { pick: 'b' });
    expect(session.kept()).toEqual({ nodes: { picked: { values: { pick: 'b' } } }, page: { pick: 'b', shown: 'picked b' } });
    expect(session.view()).toMatchObject({
      sent: { picked: { pick: 'b' } }, page: { pick: 'b', shown: 'picked b' }, outputs: { said: 'picked b' }, shown: { shown: 'picked b' }, rounds: 1, dropped: [],
    });
    expect(() => session.start(PICKED, { by: 'shown' })).toThrow(NotOffered);
    expect(() => session.start(PICKED, { values: { heading: 'written over' }, by: 'pick' })).toThrow(NotOffered);
    expect(session.view().rounds).toBe(1);
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

  it('asks what the blocks that send to its start point ask, and takes an answer into the block that asked', async () => {
    const go = { node_id: 'go', port_id: 'data' };
    const graph: Graph = {
      ...graphOf([node('go', 'start'), node('read', 'code', {}, { in: ['f:file'], out: ['f'] })], [edge('f', 'go', 'data', 'read', 'f')]),
      page: { blocks: [{ id: 'file', kind: 'input_picker', label: 'File', send: 'path', sends_to: ['go'] }, { id: 'press', kind: 'button', fires: 'go' }] },
    };
    const session = await open(graph);
    expect(session.requirements(go)).toEqual([]);
    expect(session.requirements(go, { by: 'press' })).toEqual([{ key: 'file', label: 'File', kind: 'file', current: '' }]);
    const result = await session.run(go, { answers: { file: 'a.txt' }, by: 'press' });
    expect(result.node_results.find((r) => r.node_id === 'read')!.outputs).toEqual({ f: 'a.txt' });
    expect(session.kept().page).toEqual({ file: 'a.txt' });
    expect(() => session.start(go, { answers: { nobody: 1 }, by: 'press' })).toThrow(NotOffered);
  });
});

describe('a chatbot is a page and a model', () => {
  it('remembers the turn, and sends it as history with the next one', async () => {
    const chatbot: Graph = {
      ...graphOf(
        [
          node('send', 'start'),
          node('ai', 'ai', { ai_model: 'm' }, { in: ['history:chat.history', 'message:chat.message'], out: ['output'] }),
          node('reply', 'end', {}, { in: ['value'] }),
        ],
        [edge('h', 'send', 'data', 'ai', 'history'), edge('m', 'send', 'data', 'ai', 'message'), edge('r', 'ai', 'output', 'reply', 'value')],
      ),
      page: { blocks: [{ id: 'chat', kind: 'chat', sends_to: ['send'], fires: 'send', shows: 'reply' }] },
    };
    const asked: string[] = [];
    const session = await Session.open(chatbot, {
      runtime: (report) => quietRuntime({ report, ai: { complete: async (request) => { asked.push(request.prompt); return asked.length === 1 ? '4' : '6'; } } }),
    });
    const say = (message: string) => session.run({ node_id: 'send', port_id: 'data' }, { values: { chat: message }, by: 'chat' });
    await say('What is 2+2?');
    expect(session.view().page.chat).toEqual({ messages: [{ role: 'user', text: 'What is 2+2?' }, { role: 'assistant', text: '4' }], pending: '' });
    await say('And plus 2?');
    expect(asked[1]).toBe('history:\nUser: What is 2+2?\n\nAssistant: 4\n\nmessage:\nAnd plus 2?');
  });
});

describe('the document the editor hands over', () => {
  const file = async (name: string) => join(await mkdtemp(join(tmpdir(), 'session-document-')), name);
  const roundsIn = async (path: string) => (JSON.parse(await readFile(stateFileOf(path), 'utf8')) as { rounds: number }).rounds;

  it('keeps its session when it is saved, moves its state along when saved as another file, and is given a session of its own when another editor took the server meanwhile', async () => {
    // Used in the App tab and then saved for the first time, a chat began again.
    const holder = holderOf(null, { runtime: fake });
    const session = await holder.hold(counter());
    await session.run(null);
    const saved = await file('counter.json');
    expect(await holder.hold(counter(), { path: saved, session: session.id })).toBe(session);
    expect(await roundsIn(saved)).toBe(1);

    const another = await file('another.json');
    await holder.hold(counter(), { path: another, session: session.id });
    await session.run(null);
    expect(await roundsIn(another)).toBe(2);
    expect(await roundsIn(saved)).toBe(1);

    // Two editors on one server: the second's document went into the first's
    // session, and its state into the first one's project.
    const shared = holderOf(null, { runtime: fake });
    const mine = await file('mine.json');
    const theirs = await file('theirs.json');
    const first = await shared.hold(counter(), { path: mine });
    await first.run(null);
    await shared.hold(counter('function run(i) { return { next: i.n + 10 }; }'), { path: theirs });
    const again = await shared.hold(counter(), { path: mine, session: first.id });
    expect(again).not.toBe(first);
    // From its own file: the same session, as a restarted server's would be.
    expect(again.id).toBe(first.id);
    expect(again.kept().nodes).toEqual({ count: { total: 1, round: 1 } });
    await again.run(null);
    expect(await roundsIn(mine)).toBe(2);
    expect(existsSync(stateFileOf(theirs))).toBe(false);
  });
});

describe('the application a session runs', () => {
  it('starts a start point set to start, and keeps the clock of one with an interval until it is stopped', async () => {
    const graph = graphOf(
      [
        node('tick', 'start', { started_by: 'itself', on_start: true, every: '0.05' }, { out: ['data'] }),
        node('count', 'data', { data_value: { total: 0 } }),
        node('add', 'code', { code: 'function run(i) { return { next: i.n + 1 }; }' }, { in: ['n:total'], out: ['next'] }),
      ],
      [edge('n', 'count', 'before', 'add', 'n'), edge('next', 'add', 'next', 'count', 'total'), edge('go', 'tick', 'data', 'add', RUN_PORT)],
    );
    const session = await open(graph);
    const counted = () => ((session.kept().nodes.count?.total as number | undefined) ?? 0);
    expect(await session.startApplication()).toEqual({ ticks: true });
    expect(counted()).toBeGreaterThanOrEqual(1);
    expect(session.view().clock).toMatchObject({ running: true, ticks: true });
    for (let i = 0; i < 100 && counted() < 3; i += 1) await wait(20);
    await session.stopApplication();
    expect(session.view().clock.running).toBe(false);
    const after = counted();
    expect(after).toBeGreaterThanOrEqual(3);
    await wait(150);
    expect(counted()).toBe(after);
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

  it('stays shut for another event, what the node made in an earlier round stands, and a stopped round holds nothing', async () => {
    const session = await open(reader());
    await session.run(READ, { by: 'read' });
    session.hold(reader('long'));
    const run = await session.run(LENGTH, { by: 'length' });
    expect(run.node_results.find((r) => r.node_id === 'reader')).toMatchObject({ status: 'skipped', held: true, outputs: { text: 'the file' } });
    expect(session.kept().page).toEqual({ shown: 'long: the file' });

    const stopped = await open(reader());
    stopped.hold(reader('short', 'function run() { slow; return { text: "the file" }; }'));
    const { id } = stopped.start(READ, { by: 'read' });
    await wait(30);
    stopped.stop(id);
    for (let i = 0; i < 50 && !stopped.snapshot(id)?.done; i += 1) await wait(10);
    stopped.hold(reader());
    const after = await stopped.run(LENGTH, { by: 'length' });
    expect(after.node_results.find((r) => r.node_id === 'reader')).toMatchObject({ status: 'skipped', outputs: {} });
    expect(after.node_results.find((r) => r.node_id === 'reader')!.held).toBeUndefined();
  });
});

describe('a session whose rounds run in a graph core of its own process', () => {
  it('runs them there, keeps what the nodes keep here, and lets the core go when it closes', async () => {
    const { processCore } = await import('../../graph/core/stdio.ts');
    const { fileURLToPath } = await import('node:url');
    const project = fileURLToPath(new URL('../../examples/nested_statistics', import.meta.url));
    const main = fileURLToPath(new URL('../app/main.ts', import.meta.url));
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
