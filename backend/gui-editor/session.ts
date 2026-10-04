// The graph in use, and what using it leaves behind.
//
// A graph is designed in the editor and kept as a folder; it is *used* by a
// page, a clock, a script. A session is one graph in use: the design as it
// was handed over -- by the editor, or loaded by a served tool -- and its
// state: what each node keeps between rounds (its slots), what each made last
// (the latch, kept by the graph core that runs the rounds), what the rounds showed. The rules it keeps them by are "State"
// in docs/architecture.md; what they come to here:
//
// - Using a graph never changes its design. A round runs on a working copy,
//   the design with the slots put back into it and what the round was sent
//   put into the start point it fires, and what the round leaves is read back
//   off the copy afterwards (`NodeRunner.state`).
// - A round that ran to its end commits. One that was stopped, or could not
//   start, does not: what it began is nobody's to keep.
// - A slot is kept with the design value it started from, and is dropped --
//   said, never guessed -- once its node or block is gone, or its design
//   changed: the design wins.
// - The page is used the same way: what its blocks hold -- typed, chosen, a
//   conversation -- is kept beside the nodes' slots, and what the end points
//   handed back is settled into the blocks that show them (`elements/page.ts`).
//   A round the page starts is sent what its blocks hold, in one package.
// - All of it is written to `state.json` after every round that commits, read
//   back when the session opens, and deleted by a reset.
//
// Whoever watches a session (`watch`) is told every round as it starts, goes
// and ends, and the session again whenever what it keeps changed: what the
// stream a frontend reads is made of.
//
// One session per server, for now. It has an id all the same, kept in its
// file, so that more than one needs no change to what is said about each.

import { randomUUID } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { mergeResults, type ExecutionResult, type Graph } from '../../graph/graph.ts';
import { triggeredNodes, type Trigger } from '../../graph/execution/triggers.ts';
import { memoryFeedbackEdges } from '../../graph/execution/executor.ts';
import { NotOffered, applySent, checkSent, outputsOf, sentOf } from './graphInterface.ts';
import { names } from '../../graph/execution/wiring.ts';
import type { RuntimeRequirement } from './widgets/WidgetRunner.ts';
import { startClock, type Clock } from '../../graph/execution/clock.ts';
import type { Held } from '../../graph/execution/latch.ts';
import { registry } from '../../graph/nodes/registry.ts';
import {
  applyPageValues, clearDeliveredPage, firedBy, pageBlock, pageRequirements, pageSends, pageState, sentBy, setPageState, settlePage,
  startFromPage, takesPageValue,
} from './widgets/page.ts';
import type { ProgressEvent, Runtime } from '../../graph/nodes/Runtime.ts';
import { stateFileOf } from '../app/project/folder.ts';
import { Refusal } from '../app/http.ts';
import { nodeRuntime } from '../../graph/core/node.ts';
import { Rounds, type RoundWork } from './rounds.ts';
import { chosenCore } from '../../graph/core/stdio.ts';
import type { GraphCore } from '../../graph/core/protocol.ts';
import type { RoundSnapshot, SessionView } from '../app/api.ts';

/** One slot a node keeps: what it holds now, and what its design held when that was kept. */
interface Slot {
  value: unknown;
  default: unknown;
}

/** Every node's slots that differ from its design, by node id and slot. */
type Slots = Map<string, Map<string, Slot>>;

/** The page's blocks that hold what differs from their design, by block id. */
type PageSlots = Map<string, Slot>;

/** What `state.json` holds: written after every round that commits, and never part of the project. */
interface StateFile {
  session: string;
  /** The graph's name, for whoever opens the file to see whose it is. */
  graph: string;
  saved_at: string;
  slots: Record<string, Record<string, Slot>>;
  /** What the page's blocks hold, by block id, and what each that shows an end point shows. */
  page: Record<string, Slot>;
  page_shown: Record<string, unknown>;
  held: Record<string, Held>;
  shown: ExecutionResult | null;
  rounds: number;
  finished_at: number | null;
}

/** What a round is asked with: what it is sent, what it asked before it ran, and who sends it. */
export interface RoundAsk {
  /**
   * What it is sent. For a round the page starts (*by* a block of it): what
   * the page's blocks hold, by block id. For any other round of a start
   * point: its package's values, as the sender named them. A round of the
   * whole graph is sent nothing: no start point takes it.
   */
  values?: Record<string, unknown>;
  /**
   * What the page asked before a round it starts ran (`Session.requirements`),
   * answered under the keys it asked with: the blocks' ids.
   */
  answers?: Record<string, unknown>;
  /** Who sends it, as the package says: a block of the page by its id, or one of `SENDERS`. A call, when left out. */
  by?: string;
}

/** What a watcher of a session is told: a round as it starts, goes and ends, or the session after a change. */
export type SessionEvent =
  | { type: 'round'; round: RoundSnapshot }
  | { type: 'session'; session: SessionView };

export interface SessionOptions {
  /** Where its state is kept (`stateFileOf`). None: a graph never saved, whose state lives as long as the session. */
  file?: string | null;
  /** The services a round runs with, told where to say how far it is. A test hands in fakes. */
  runtime?: (report: (event: ProgressEvent) => void) => Runtime;
  /**
   * What runs its rounds: the graph core `AI_GRAPH_CORE` names, else the
   * JavaScript core in this process with *runtime* (`core/stdio.ts`).
   */
  core?: () => GraphCore;
}

/** How often a watcher is told how far a round is: a fan-out over 500 items reports 500 times. */
const PROGRESS_EVERY_MS = 100;

export class Session {
  readonly id: string;
  private design: Graph;
  private slots: Slots = new Map();
  private pageSlots: PageSlots = new Map();
  /** What each block that shows an end point shows, laid over from every round. */
  private pageShown: Record<string, unknown> = {};
  /** What every node was last left holding, as the core said after the last round: for state.json. */
  private held: Record<string, Held> = {};
  private readonly core: GraphCore;
  private readonly rounds: Rounds;
  private shown: ExecutionResult | null = null;
  private count = 0;
  private finishedAt: number | null = null;
  private notes: string[] = [];
  private lastRound: string | null = null;
  /** The design as it was handed over, written out, and how often it changed since the session began. */
  private designText: string;
  private revision = 0;
  /** The clock, while the application runs, and what stops the rounds it started. */
  private application: { clock: Clock; stop: AbortController } | null = null;
  private file: string | null;
  private readonly runtime: (report: (event: ProgressEvent) => void) => Runtime;
  private readonly watchers = new Set<(event: SessionEvent) => void>();
  /** When each round's watchers were last told how far it is. */
  private readonly told = new Map<string, number>();
  /** The last write of the file, so the next waits for it: two at once would leave half of each. */
  private writing: Promise<void> = Promise.resolve();

  private constructor(id: string, design: Graph, options: SessionOptions) {
    this.id = id;
    this.design = design;
    this.designText = JSON.stringify(design);
    this.file = options.file ?? null;
    this.runtime = options.runtime ?? ((report) => nodeRuntime({ report }));
    this.core = options.core?.() ?? chosenCore({ runtime: options.runtime });
    this.rounds = new Rounds((round, moment) => this.roundChanged(round, moment));
  }

  /** A session of *graph*, going on from what its file kept -- or a new one, when there is no file or it cannot be read. */
  static async open(graph: Graph, options: SessionOptions = {}): Promise<Session> {
    const file = options.file ?? null;
    let kept: StateFile | null = null;
    let unreadable = false;
    if (file) {
      try {
        kept = JSON.parse(await readFile(file, 'utf8')) as StateFile;
      } catch (error) {
        unreadable = (error as NodeJS.ErrnoException).code !== 'ENOENT';
      }
    }
    const session = new Session(typeof kept?.session === 'string' ? kept.session : randomUUID(), graph, options);
    if (kept) session.recall(kept);
    await session.core.open(session.held);
    if (unreadable) session.notes = [`${file} could not be read: this session starts with nothing kept.`];
    return session;
  }

  /** The design in use. */
  get graph(): Graph {
    return this.design;
  }

  /** Which design this is, counted from 0 as it changes (SessionView.design_revision). */
  get designRevision(): number {
    return this.revision;
  }

  /** Where this session keeps its state; none, for a graph never saved. */
  get stateFile(): string | null {
    return this.file;
  }

  /**
   * Keep the state in *file* from now on, and write it there: the same
   * document, saved where it was not -- for the first time, or as another
   * project. What using it left goes along rather than being lost to a save;
   * the file it was kept in before stays as it was.
   */
  moveTo(file: string | null): Promise<void> {
    this.file = file;
    return this.save();
  }

  /** What the last time the session was opened, or handed a graph, dropped of what it kept -- in words. */
  get dropped(): string[] {
    return this.notes;
  }

  /**
   * What using the graph left that differs from its design: each node's
   * slots, by node id and slot, and what each block of the page holds, by
   * block id. Apart, because a block and a node may share a name.
   */
  kept(): { nodes: Record<string, Record<string, unknown>>; page: Record<string, unknown> } {
    return {
      nodes: Object.fromEntries([...this.slots].map(([node, slots]) => [node, Object.fromEntries([...slots].map(([key, slot]) => [key, slot.value]))])),
      page: Object.fromEntries([...this.pageSlots].map(([id, slot]) => [id, slot.value])),
    };
  }

  /** The session as whoever uses the graph sees it: by name, never by node. */
  view(): SessionView {
    const clock = this.application?.clock;
    const copy = withState(this.design, this.slots, this.pageSlots);
    return {
      session: this.id,
      sent: sentOf(copy, registry),
      outputs: outputsOf(this.design, this.shown, registry),
      page: pageState(copy),
      shown: this.pageShown,
      kept: this.kept(),
      rounds: this.count,
      finished_at: this.finishedAt,
      round: this.lastRound ? this.snapshot(this.lastRound) : null,
      dropped: this.notes,
      design_revision: this.revision,
      clock: {
        running: !!clock,
        runs_by_itself: clock?.runsByItself ?? false,
        ticks: clock?.ticks ?? false,
        next_at: clock?.nextAt() ?? null,
        problem: clock?.problem() ?? null,
      },
    };
  }

  /**
   * What a round for *trigger* asks before it runs, asked with *ask*: for one
   * the page starts (*by* a block of it), what the blocks that send to its
   * start point ask -- a picker with nothing chosen -- unless a value or an
   * answer gives it. Any other round is sent what it needs, and asks nothing.
   */
  requirements(trigger: Trigger | null, ask: RoundAsk = {}): RuntimeRequirement[] {
    const { values = {}, answers = {}, by = 'call' } = ask;
    const copy = withState(this.design, this.slots, this.pageSlots);
    if (!fromPage(copy, trigger, by)) return [];
    applyPageValues(copy, values);
    return pageRequirements(copy, trigger!.node_id).filter((asked) => !(asked.key in values) && !(asked.key in answers));
  }

  /**
   * Be told what happens in this session from now on: every round as it
   * starts, goes and ends, and the session whenever what it keeps changed.
   * Returns how to stop being told.
   */
  watch(listener: (event: SessionEvent) => void): () => void {
    this.watchers.add(listener);
    return () => { this.watchers.delete(listener); };
  }

  /**
   * Go on with a changed design: what the editor hands over as it is edited.
   * What the session kept for a node that is gone, or a slot whose design
   * changed, is dropped and said; the rest stays. Returns what was said.
   * Watchers are told the session again when the design changed -- its
   * `design_revision` counts on -- or something was dropped.
   */
  hold(graph: Graph): string[] {
    this.design = graph;
    // Handed over before every round and after every edit: most often it is
    // the same design again, which changes nothing a page drew.
    const text = JSON.stringify(graph);
    const changed = text !== this.designText;
    this.designText = text;
    if (changed) this.revision += 1;
    this.fit(this.slots, this.pageSlots);
    if (this.notes.length) void this.save();
    if (changed || this.notes.length) this.tell({ type: 'session', session: this.view() });
    return this.notes;
  }

  /**
   * Start a round for *trigger* -- the whole graph for none -- asked with
   * *ask*, and hand back its id at once, to watch it by. A round the page
   * starts (`by` a block of it) is sent what the page's blocks hold, and its
   * start point what the blocks that send to it hold -- a block that does not
   * fire it, or a value for a block that takes none, is refused before
   * anything starts (`NotOffered`). Any other sender's values are the start
   * point's package as they come; values for a round of the whole graph, which
   * no start point takes, are refused. An answer goes to the block that asked,
   * and one to a question nobody asked is refused as well. *signal* stops it,
   * as Stop does.
   */
  start(trigger: Trigger | null, ask: RoundAsk = {}, signal?: AbortSignal): { id: string; total: number; outcome: Promise<ExecutionResult> } {
    const design = this.design;
    const asked: Sent = { trigger, values: ask.values ?? {}, answers: ask.answers ?? {}, by: ask.by ?? 'call' };
    const { values, answers, by } = asked;
    const page = fromPage(design, trigger, by);
    if (page) checkPageRound(design, trigger!, by, values);
    else checkSent(design, trigger, values, registry);
    checkAnswers(design, trigger, page, answers);
    // How many nodes it runs, said before it is queued -- the slice its start point reaches.
    const only = trigger ? triggeredNodes(design, trigger, memoryFeedbackEdges(design.nodes, design.edges, registry)) : null;
    const total = only?.size ?? design.nodes.length;
    const labels = new Map(design.nodes.map((node) => [node.id, node.label || node.id]));
    const started = trigger ? { event: trigger.node_id, by } : null;
    const { id, outcome } = this.rounds.start(total, (node) => labels.get(node) ?? node, (work) => this.round(asked, work), signal, started);
    this.lastRound = id;
    return { id, total, outcome };
  }

  /** Run a round and wait for what it produced. *signal* stops it, as Stop does. */
  run(trigger: Trigger | null, ask: RoundAsk = {}, signal?: AbortSignal): Promise<ExecutionResult> {
    return this.start(trigger, ask, signal).outcome;
  }

  /** A round as a watcher sees it -- and, once it has ended, what it handed back by name. */
  snapshot(id: string): RoundSnapshot | null {
    const snapshot = this.rounds.snapshot(id);
    if (!snapshot) return null;
    return { ...snapshot, outputs: snapshot.result ? outputsOf(this.design, snapshot.result, registry) : null };
  }

  stop(id: string): boolean {
    return this.rounds.stop(id);
  }

  /** Stop every round going or waiting, and wait for each to end: see `Rounds.stopAll`. */
  stopAll(): Promise<number> {
    return this.rounds.stopAll();
  }

  /** Stop every round and let the graph core go: a core of its own process ends. */
  async close(): Promise<void> {
    await this.stopApplication();
    await this.stopAll();
    await this.core.close();
  }

  /**
   * Start what runs by itself: each start point set to start when the tool starts starts,
   * and each with an interval keeps its time (`execution/clock.ts`) -- the one
   * clock a served tool and the editor's ▶ Run keep alike, in the server, so
   * it goes on whether or not a page is open. Its rounds are rounds like any
   * other. Resolves once the rounds starting it have run, with whether a
   * clock goes on ticking.
   */
  async startApplication(): Promise<{ ticks: boolean }> {
    await this.stopApplication();
    const stop = new AbortController();
    const clock = startClock(() => this.design, registry, async (event) => {
      if (stop.signal.aborted) return;
      // A round that could not start says so in its own record; the next may be fine.
      await this.run(event, { by: 'itself' }, stop.signal).catch(() => {});
    });
    this.application = { clock, stop };
    this.tell({ type: 'session', session: this.view() });
    await clock.started;
    return { ticks: clock.ticks };
  }

  /** Stop the clock: no round of it starts afterwards, and the one in flight is stopped. */
  async stopApplication(): Promise<void> {
    const running = this.application;
    if (!running) return;
    this.application = null;
    running.stop.abort();
    await running.clock.stop();
    this.tell({ type: 'session', session: this.view() });
  }

  /**
   * Forget everything using the graph left behind, file and all, once the
   * round going now has ended: the graph is as it was designed again.
   */
  reset(): Promise<void> {
    return this.rounds.exclusive(async () => {
      this.slots = new Map();
      this.pageSlots = new Map();
      this.pageShown = {};
      this.held = {};
      await this.core.forget();
      this.shown = null;
      this.count = 0;
      this.finishedAt = null;
      this.notes = [];
      this.lastRound = null;
      await this.writing;
      if (this.file) await rm(this.file, { force: true });
      this.tell({ type: 'session', session: this.view() });
    });
  }

  /** One round, on a working copy; what it leaves is kept only once it has run to its end. */
  private async round(asked: Sent, work: RoundWork): Promise<ExecutionResult> {
    const design = this.design;
    const { trigger } = asked;
    const copy = withState(design, this.slots, this.pageSlots);
    const runtime = this.runtime(work.report);
    // The page starts it: what its blocks hold now is kept, and the start
    // point is sent what the blocks that send to it hold -- read where it is
    // read, a folder's listing, a file's text. Anyone else's values are the
    // package as they come.
    const page = fromPage(copy, trigger, asked.by);
    const delivered = page ? sentBy(copy, trigger!.node_id).map((widget) => widget.id) : [];
    if (page) {
      applyPageValues(copy, { ...asked.values, ...asked.answers });
      applySent(copy, trigger, await pageSends(copy, trigger!.node_id, runtime), asked.by, registry);
    } else {
      applySent(copy, trigger, asked.values, asked.by, registry);
      // A round of everything counts the page's events as fired too.
      if (!trigger) await startFromPage(copy, runtime, registry);
    }
    const sentPage = pageState(copy);
    const ended = await this.core.round({ graph: copy, trigger }, work.report, work.signal);
    const { result } = ended;
    // Stopped: not a round, as a clock's cut off by a shutdown never was. Said by the core,
    // which committed what the round left only when it ran to its end: a Stop that came
    // after that is too late to take it back.
    if (result.status === 'cancelled') return result;
    // What the nodes keep now, as the core ran them: read back as a round in this process left them.
    for (const node of copy.nodes) registry.node(node.node_type)?.setState(node, ended.nodes[node.id] ?? {});

    // What the end points handed back this round -- not what stood still, which
    // a conversation must not be told twice -- reaches the blocks that show
    // them; a message the page sent with it is said, and emptied.
    const fresh = { ...result, node_results: result.node_results.filter((one) => !one.held && (one.status === 'success' || one.status === 'partial')) };
    const shown = await settlePage(copy, outputsOf(copy, fresh, registry), runtime);
    clearDeliveredPage(copy, Object.fromEntries(Object.entries(sentPage).filter(([id]) => delivered.includes(id))));
    ({ slots: this.slots, page: this.pageSlots } = slotsOf(copy, design));
    // A design handed over while the round ran is the one that holds now.
    if (this.design !== design) this.fit(this.slots, this.pageSlots);
    this.held = ended.held;
    this.shown = this.shown ? mergeResults(this.shown, result) : result;
    this.pageShown = { ...this.pageShown, ...shown };
    this.count += 1;
    this.finishedAt = Date.now();
    await this.save();
    this.tell({ type: 'session', session: this.view() });
    return result;
  }

  /** A round started, began, ended or went a step further: tell the watchers -- how far it is, not more often than they can use. */
  private roundChanged(id: string, moment: boolean): void {
    if (!this.watchers.size) return;
    const now = Date.now();
    if (!moment && now - (this.told.get(id) ?? 0) < PROGRESS_EVERY_MS) return;
    this.told.set(id, now);
    const round = this.snapshot(id);
    if (round?.done) this.told.delete(id);
    if (round) this.tell({ type: 'round', round });
  }

  private tell(event: SessionEvent): void {
    for (const watcher of this.watchers) {
      try {
        watcher(event);
      } catch {
        // One watcher that cannot listen is no reason to stop telling the others.
      }
    }
  }

  /**
   * Keep of *slots* and *page* what the design still has a place for. What it
   * has not -- a node or a block gone, a slot whose design changed -- is
   * dropped, and said in `notes`.
   */
  private fit(slots: Slots, page: PageSlots): void {
    const notes: string[] = [];
    const byId = new Map(this.design.nodes.map((node) => [node.id, node]));
    this.slots = new Map();
    for (const [nodeId, held] of slots) {
      const node = byId.get(nodeId);
      if (!node) {
        notes.push(`What "${nodeId}" kept was dropped: it is no longer in the graph.`);
        continue;
      }
      const designed = registry.node(node.node_type)?.state(node) ?? {};
      const kept = fitting(held, designed, notes, (key) => `What "${nodeId}" kept in "${key}"`, (key) => `"${key}" is no longer there`);
      if (kept.size) this.slots.set(nodeId, kept);
    }
    this.pageSlots = fitting(page, pageState(this.design), notes, (id) => `What the block "${id}" held`, () => 'it is no longer on the page');
    this.notes = notes;
  }

  /** Take back what the file kept, as far as the design still has a place for it. */
  private recall(kept: StateFile): void {
    const slots: Slots = new Map(Object.entries(kept.slots ?? {}).map(([node, held]) => [node, new Map(Object.entries(held))]));
    this.fit(slots, new Map(Object.entries(kept.page ?? {})));
    this.pageShown = kept.page_shown ?? {};
    this.held = kept.held ?? {};
    this.shown = kept.shown ?? null;
    this.count = Number(kept.rounds) || 0;
    this.finishedAt = kept.finished_at ?? null;
  }

  /** Write the file -- after the write before it, and beside it first, so a crash leaves the one before whole. */
  private save(): Promise<void> {
    const file = this.file;
    if (!file) return Promise.resolve();
    this.writing = this.writing.then(async () => {
      const kept: StateFile = {
        session: this.id,
        graph: this.design.metadata?.name ?? '',
        saved_at: new Date().toISOString(),
        slots: Object.fromEntries([...this.slots].map(([node, slots]) => [node, Object.fromEntries(slots)])),
        page: Object.fromEntries(this.pageSlots),
        page_shown: this.pageShown,
        held: Object.fromEntries(Object.entries(this.held).filter(([node]) => this.design.nodes.some((one) => one.id === node))),
        shown: this.shown,
        rounds: this.count,
        finished_at: this.finishedAt,
      };
      try {
        await writeFile(`${file}.tmp`, `${JSON.stringify(kept, null, 2)}\n`);
        await rename(`${file}.tmp`, file);
      } catch {
        // A tool in a folder it may not write to still runs; it only forgets on restart.
      }
    });
    return this.writing;
  }
}

/** How a graph is handed over: from which file, and as the document of which session. */
export interface Handover {
  /** Where the graph is kept, if anywhere: its session keeps its state beside it (`stateFileOf`). */
  path?: string | null;
  /**
   * The session the editor holds for this document. That one goes on; none
   * -- a document opened, or started anew -- or one this server no longer
   * holds, because another editor handed it another document since, and the
   * document is given a session of its own, from its own file.
   */
  session?: string | null;
}

/**
 * The session a server holds -- none yet, for the editor, until a graph is
 * handed over -- and the one way a graph is handed over.
 */
export interface SessionHolder {
  session: Session | null;
  /**
   * Go on with *graph*: the session it names, handed a changed design -- and,
   * the document saved somewhere new, its state moved along -- or, for any
   * other, a session of its own, the one before stopped.
   */
  hold(graph: Graph, handover?: Handover): Promise<Session>;
  /**
   * The session a request asks about: the one held -- unless it names
   * another, which is not here: a 404 that sends a page back to the interface.
   */
  asked(id?: string): Session;
  /**
   * Be told what happens in the session held, whichever that is: its rounds
   * and changes, and the session itself when another is held from then on --
   * the editor handed it another document -- so a page open on the server
   * does not go on listening to one that is gone. Returns how to stop.
   */
  watch(listener: (event: SessionEvent) => void): () => void;
}

/** A holder of *session*, or of none until a graph is handed to it; the sessions it opens are opened with *options*. */
export function holderOf(session: Session | null = null, options: Omit<SessionOptions, 'file'> = {}): SessionHolder {
  const watchers = new Set<(event: SessionEvent) => void>();
  const tell = (event: SessionEvent): void => { for (const watcher of watchers) watcher(event); };
  let unwatch = session ? session.watch(tell) : null;
  return {
    session,
    asked(id) {
      if (!this.session) throw new Refusal(404, 'This server holds no graph yet.');
      if (id && id !== this.session.id) {
        throw new Refusal(404, `No session "${id}" here: this server's is "${this.session.id}". Ask for its interface again.`);
      }
      return this.session;
    },
    async hold(graph, { path = null, session = null } = {}) {
      const file = path ? stateFileOf(path) : null;
      const before = this.session;
      if (before && session === before.id) {
        if (before.stateFile !== file) await before.moveTo(file);
        before.hold(graph);
        return before;
      }
      if (before) await before.close();
      this.session = await Session.open(graph, { ...options, file });
      unwatch?.();
      unwatch = this.session.watch(tell);
      tell({ type: 'session', session: this.session.view() });
      return this.session;
    },
    watch(listener) {
      watchers.add(listener);
      return () => { watchers.delete(listener); };
    },
  };
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** What a round was sent: the event it is for, and what it was asked with (`RoundAsk`). */
interface Sent {
  trigger: Trigger | null;
  values: Record<string, unknown>;
  answers: Record<string, unknown>;
  by: string;
}

/**
 * Refuse *answers* to a question nobody asked: only a round the page starts
 * asks, and only the blocks that send to its start point, by their ids.
 */
function checkAnswers(graph: Graph, trigger: Trigger | null, page: boolean, answers: Record<string, unknown>): void {
  const asked = page ? pageRequirements(graph, trigger!.node_id).map((question) => question.key) : [];
  const unasked = Object.keys(answers).filter((key) => !asked.includes(key));
  if (!unasked.length) return;
  throw new NotOffered(asked.length
    ? `Nothing asked ${names(unasked)}: this round asks ${names(asked)}.`
    : `Nothing asked ${names(unasked)}: this round asks nothing.`);
}

/** Whether a round for *trigger* is one the page starts: sent by one of its blocks, at a start point. */
function fromPage(graph: Graph, trigger: Trigger | null, by: string): boolean {
  if (!trigger || !pageBlock(graph, by)) return false;
  const node = graph.nodes.find((one) => one.id === trigger.node_id);
  return !!node && !!registry.node(node.node_type)?.takesPackage;
}

/**
 * Refuse a round the page could not have started: *by* is a block that does
 * not fire the start point, or *values* name a block that takes none.
 */
function checkPageRound(graph: Graph, trigger: Trigger, by: string, values: Record<string, unknown>): void {
  const firing = firedBy(graph, trigger.node_id).map((widget) => widget.id);
  if (!firing.includes(by)) {
    throw new NotOffered(`The block "${by}" does not fire "${trigger.node_id}"${firing.length ? `; it is fired by ${names(firing)}` : ''}.`);
  }
  const unknown = Object.keys(values).filter((id) => !takesPageValue(graph, id));
  if (unknown.length) throw new NotOffered(`No block ${names(unknown)} on the page takes a value.`);
}

/** *design* with what the session keeps put back into it -- each node's slots, and the page's -- on a copy: what a round starts from. */
function withState(design: Graph, slots: Slots, page: PageSlots): Graph {
  const copy = structuredClone(design);
  for (const node of copy.nodes) {
    const held = slots.get(node.id);
    if (held) registry.node(node.node_type)?.setState(node, Object.fromEntries([...held].map(([key, slot]) => [key, slot.value])));
  }
  if (page.size) setPageState(copy, Object.fromEntries([...page].map(([id, slot]) => [id, slot.value])));
  return copy;
}

/** Of what is held *now*, what differs from what is *designed*: a slot for each key the design has, holding something else. */
function differing(now: Record<string, unknown>, designed: Record<string, unknown>): Map<string, Slot> {
  const slots = new Map<string, Slot>();
  for (const [key, value] of Object.entries(now)) {
    if (key in designed && !same(value, designed[key])) slots.set(key, { value, default: designed[key] });
  }
  return slots;
}

/** What each node of *copy*, and each block of its page, keeps that differs from what *design* says it holds. */
function slotsOf(copy: Graph, design: Graph): { slots: Slots; page: PageSlots } {
  const designed = new Map(design.nodes.map((node) => [node.id, node]));
  const slots: Slots = new Map();
  for (const node of copy.nodes) {
    const element = registry.node(node.node_type);
    const plan = designed.get(node.id);
    if (!element || !plan) continue;
    const held = differing(element.state(node), element.state(plan));
    if (held.size) slots.set(node.id, held);
  }
  return { slots, page: differing(pageState(copy), pageState(design)) };
}

/**
 * What of *slots* the *designed* values still have a place for. Each slot they
 * have not is said in *notes*: *what* was dropped, and why -- its key *gone*,
 * or its design changed.
 */
function fitting(
  slots: Map<string, Slot>,
  designed: Record<string, unknown>,
  notes: string[],
  what: (key: string) => string,
  gone: (key: string) => string,
): Map<string, Slot> {
  const kept = new Map<string, Slot>();
  for (const [key, slot] of slots) {
    if (!(key in designed)) notes.push(`${what(key)} was dropped: ${gone(key)}.`);
    else if (!same(designed[key], slot.default)) notes.push(`${what(key)} was dropped: its design changed.`);
    else kept.set(key, slot);
  }
  return kept;
}
