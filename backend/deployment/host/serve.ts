// The server: the built gui or editor, and the routes of `api.ts`.
//
// One server for every use. Every host answers `API` -- the graph it holds, a way
// to run it, the file picker -- and is composed with what else it has: a gui
// (its hooks into the session, and the route that tells what it was designed
// as), the editor (its built app, and the routes only it has). The command line
// does the composing (`backend/cli`); this file imports neither, so a package
// without the editor cannot answer an editor route even by mistake.
//
// The tables are the security boundary, and each is written out in one place
// (`api.ts`) rather than assembled from a router someone might extend later
// without noticing where it ends up. A route this server has no handler for is
// a server that cannot start: the gui and the server never disagree about
// what exists.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { registry } from '../../../graph/nodes/registry.ts';
import { names } from '../../../graph/wiring.ts';
import { confineEverything } from '../runtime/confine.ts';
import { aiSetting, settingsPath } from '../runtime/ai/settings.ts';
import { API, GUI_API, matchRoute, type RequestOf, type Routes } from './api.ts';
import {
  Download, EventStream, Refusal, foreignRequest, hostnameOf, message, namesFor, readJson, sendDownload, sendEvents, sendFailure, sendJson, servePage,
  type Exchange, type HandlersOf,
} from './http.ts';
import { NotOffered, eventOf, outputsOf } from '../../../graph/interface.ts';
import { browse, startFolder } from './browse.ts';
import { extensionFilter } from '../../../graph/nodes/folderListing.ts';
import { NotFound } from '../../../graph/errors.ts';
import { NO_GUI, Session, holderOf, type SessionHolder } from './session.ts';
import type { GuiHooks, GuiPart } from '../gui/hooks.ts';
import { Lifecycle } from './lifecycle.ts';
import { frontendOf, loadGraph, projectFolderOf, stateFileOf } from '../project/folder.ts';

interface ServeOptions {
  /**
   * The graph this server ships, for a deployed tool.
   *
   * Optional, because the editor hands its session the graph being edited,
   * so there is nothing to serve until it does unless it is given one. With
   * it come a session that goes on from its state.json, the graph's clock,
   * and the folder the file picker opens in.
   */
  graphPath?: string;
  /** Where the built gui lives, if this bundle carries one. */
  guiDir?: string;
  port?: number;
  host?: string;
  /** The gui the tool has: what its blocks do around a round, and the route that tells what it was designed as. None: a tool with no gui, or a page of its own. */
  gui?: GuiPart;
  /** Serve the editor instead of a deployed gui: `dist` is the built editor, `api` its routes and `handlers` what answers them. */
  editor?: { dist: string; api: Routes; handlers: (held: SessionHolder) => Handlers };
}

/** What answers routes, by the name each is called by: the tables of several modules at once, so not typed by one. */
type Handlers = Record<string, ((request: never, exchange: Exchange) => unknown) | undefined>;

/** A server that is up: where it listens, and the one way to take it down. */
export interface Served {
  server: Server;
  url: string;
  /** Bound to this machine only: what a `local` route (`api.ts`) needs. */
  loopback: boolean;
  /** Stop the clock, end the runs in flight, then close. Resolves to what would not stop in time. */
  shutdown: (graceMs?: number) => Promise<string[]>;
}

/** Whether a bind address is this machine only. */
export const isLoopbackHost = (host: string): boolean => host === '127.0.0.1' || host === 'localhost' || host === '::1';

export async function serve(options: ServeOptions): Promise<Served> {
  // Everything below that outlives a request is written down here as it is
  // started, and stopped in that order: see lifecycle.ts.
  const lifecycle = new Lifecycle();
  const host = options.host ?? '127.0.0.1';
  const loopback = isLoopbackHost(host);
  // A tool open to the network reads and writes below its own folder only, whoever names a path (a remote caller's values too).
  if (!loopback && !options.editor) {
    confineEverything();
    lifecycle.own('the file confinement', () => confineEverything(false));
  }
  const exchange: Exchange = { loopback };
  /** Who this server is, for telling its own page from another's: its port is known once it listens. */
  const self = { loopback, port: 0, names: namesFor(host) };

  // The graph in use, and what using it leaves behind: one session, shared by
  // the clock and every gui, so all queue for one graph and all read what its
  // nodes were left holding. A deployed tool's is opened with the server, goes
  // on from its state.json and keeps its clock from the start; the editor's
  // begins with the graph it hands over, and its clock runs from ▶ Run to ■ Stop.
  const gui = options.gui?.hooks ?? NO_GUI;
  const held = holderOf(options.graphPath
    ? await Session.open(await loadGraph(options.graphPath), { file: stateFileOf(options.graphPath), gui })
    : null, { gui });
  const frontend = options.graphPath ? frontendOf(options.graphPath) : null;
  lifecycle.own('the clock', async () => { await held.session?.stopApplication(); });
  lifecycle.own('rounds in flight', async () => { await held.session?.close(); });

  const api: Routes = { ...API, ...(options.gui ? GUI_API : {}), ...options.editor?.api };
  const handlers: Handlers = {
    // Where an empty path opens the picker, decided here and nowhere else. A
    // tool's opens where its graph is — a bundle's own folder, which is also
    // what its paths are relative to. The editor's opens where the editor was
    // started, even when it was given a graph to serve as well -- or in the
    // person's home, when that is the program's own folder (`startFolder`).
    ...toolRoutes(held, options.gui, gui, options.editor || !options.graphPath
      ? await startFolder()
      : (projectFolderOf(options.graphPath) ?? dirname(resolve(options.graphPath)))),
    // `held` goes in so the editor can hand this server the graph it is
    // editing and then open `runtime.html` against it: the delivered gui, in
    // its own window, served by the same route a bundle serves.
    ...options.editor?.handlers(held),
  };
  const missing = Object.keys(api).filter((name) => !handlers[name]);
  if (missing.length) throw new Error(`No handler for ${missing.join(', ')}: the server and api.ts disagree.`);

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    // Only the path and the query are read, so the base is any that parses:
    // the bound address does not, where it is `::1`.
    const url = new URL(request.url ?? '/', 'http://localhost');
    const path = url.pathname;
    const foreign = foreignRequest(request, self, path.startsWith('/api/'));
    if (foreign) return sendJson(response, 403, { detail: foreign });

    if (path.startsWith('/api/')) {
      const found = matchRoute(api, request.method ?? 'GET', path);
      // Watching and stopping still answer while the rounds wind down; nothing new starts.
      if (lifecycle.stopping && request.method !== 'GET' && found?.name !== 'stopRound' && found?.name !== 'stopApplication') {
        return sendJson(response, 503, { detail: 'This server is stopping.' });
      }
      const handler = found ? handlers[found.name] as ((request: unknown, exchange: Exchange) => unknown) | undefined : undefined;
      if (!found || !handler) return sendJson(response, 404, { detail: 'Not part of this server.' });
      const route = api[found.name];
      // The one place the loopback rule is kept: the table says which routes it holds for.
      if (route.local && !loopback) {
        return sendJson(response, 403, { detail: `This works on the machine the server runs on only, and it is bound to ${host}.` });
      }
      try {
        // Inside the try: a body that is not JSON, or is too big to accept, is
        // this request being turned down -- 400 or 413, not a server that broke.
        // The path's own parameters last: a body cannot name another round than the one addressed.
        const asked = {
          ...Object.fromEntries(url.searchParams),
          ...(route.method === 'POST' ? await readJson(request) : {}),
          ...found.params,
        };
        const answer = await handler(asked, exchange);
        if (answer instanceof Download) return sendDownload(response, answer);
        if (answer instanceof EventStream) return sendEvents(response, answer);
        return sendJson(response, 200, answer);
      } catch (error) {
        if (error instanceof Refusal) return sendJson(response, error.status, { detail: error.message, ...error.extra });
        // A name the graph does not offer is the caller's mistake, said as one.
        if (error instanceof NotOffered) return sendJson(response, 400, { detail: error.message });
        // A session or graph that is not there.
        if (error instanceof NotFound) return sendJson(response, 404, { detail: error.message });
        throw error;
      }
    }

    if (options.editor) return servePage(response, path, options.editor.dist, 'index.html');
    // A gui of the project's own, written by hand against the runtime API, wins over the built one.
    if (frontend) return servePage(response, path, frontend, 'index.html');
    if (options.guiDir) return servePage(response, path, options.guiDir, 'runtime.html');
    return sendJson(response, 404, { detail: 'No gui.' });
  }

  const server = createServer((request, response) => {
    handle(request, response).catch((error: unknown) => sendFailure(response, error));
  });
  // Closed directly -- a test, an embedding program -- it still lets go of the rest.
  server.on('close', () => { void lifecycle.shutdown(); });
  lifecycle.own('the HTTP server', () => new Promise<void>((closed) => {
    if (!server.listening) return closed();
    server.close(() => closed());
    // A page polling over keep-alive would hold `close` open for as long as it polls.
    server.closeIdleConnections();
    setTimeout(() => server.closeAllConnections(), 1000).unref();
  }));
  // A port that cannot be listened on is this call failing, not the process
  // dying: without the `error` handler the event is unhandled and Node prints
  // a stack trace over whatever the caller was about to say. What was already
  // started -- the clock, above all -- is stopped before the failure leaves.
  await new Promise<void>((listening, failed) => {
    const gaveUp = (error: Error) => { void lifecycle.shutdown().then(() => failed(error), () => failed(error)); };
    server.once('error', gaveUp);
    server.listen(options.port ?? 0, host, () => {
      server.off('error', gaveUp);
      listening();
    });
  });
  self.port = (server.address() as AddressInfo).port;
  // Only now: a server that could not listen (the next port is tried) must not have run what starts with a tool.
  if (held.session && !options.editor) {
    held.session.startApplication().catch((error: unknown) => { process.stderr.write(`The tool's start failed: ${message(error)}\n`); });
  }
  // An IPv6 address in brackets, as a browser takes it -- and every address,
  // which no browser can open, as this machine's own.
  const named = WILDCARD.get(host) ?? hostnameOf(host) ?? host;
  return { server, url: `http://${named}:${self.port}`, loopback, shutdown: (graceMs) => lifecycle.shutdown(graceMs) };
}

/** A bind to every address, and the one of them a browser here opens: this machine's own. */
const WILDCARD = new Map([['0.0.0.0', '127.0.0.1'], ['::', '[::1]']]);

/** Whether a failure to start is "something else is already on that port". */
export function portTaken(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === 'EADDRINUSE';
}

/**
 * A round asked from beyond this machine sets no picker's file or folder: the
 * path would be read here, for whoever asked. What a picker was designed with
 * is read as ever.
 */
function refuseFarPaths(session: Session, hooks: GuiHooks, asked: RequestOf<(typeof API)['startRound']>, { loopback }: Exchange): void {
  if (loopback) return;
  const named = hooks.pathBlocks(session.graph, Object.keys({ ...asked.values, ...asked.answers }));
  if (named.length) throw new Refusal(403, `A file or folder is chosen on the machine the server runs on, so a request from elsewhere may not set ${names(named)}.`);
}

/** The `tool` rows: what any server answers, a deployed tool's included. */
function toolRoutes(
  held: SessionHolder,
  part: GuiPart | undefined,
  gui: GuiHooks,
  /** Where the file picker opens: the folder a tool's graph sits in, or where the editor was started. */
  toolRoot: string,
): HandlersOf<typeof API & typeof GUI_API> {
  const sessionAsked = (asked: { session?: string }): Session => held.asked(asked.session);

  return {
    // -- the runtime API: what any frontend uses, by name ---------------------

    interface(asked) {
      const session = sessionAsked(asked);
      const { name, description } = session.graph.metadata;
      return { session: session.id, name, description: description ?? '', ...gui.interfaceOf(session.graph) };
    },

    session: (asked) => sessionAsked(asked).view(),

    // The session held now, and from then on whichever the server holds:
    // the editor handing it another document is a new session on the stream.
    stream(asked) {
      const session = sessionAsked(asked);
      return new EventStream((send) => {
        send('session', session.view());
        return held.watch((event) => send(event.type, event.type === 'round' ? event.round : event.session));
      });
    },

    requirements(asked) {
      const session = sessionAsked(asked);
      return session.requirements(eventOf(session.graph, asked.event, registry), asked);
    },

    startRound(asked, exchange) {
      const session = sessionAsked(asked);
      refuseFarPaths(session, gui, asked, exchange);
      const { id, total } = session.start(eventOf(session.graph, asked.event, registry), asked);
      return { session: session.id, round_id: id, total };
    },

    round(asked) {
      const snapshot = sessionAsked(asked).snapshot(asked.id);
      if (!snapshot) throw new Refusal(404, 'No such round.');
      return snapshot;
    },

    stopRound: (asked) => ({ stopped: sessionAsked(asked).stop(asked.id) }),

    async runRound(asked, exchange) {
      const session = sessionAsked(asked);
      refuseFarPaths(session, gui, asked, exchange);
      const { id, outcome } = session.start(eventOf(session.graph, asked.event, registry), asked);
      const ended = await outcome.then((result) => result, (error: unknown) => {
        // Stopped while it waited: a round that did not run, not a graph that cannot.
        if (session.snapshot(id)?.cancelled) return null;
        throw new Refusal(422, `The graph could not run: ${message(error)}`);
      });
      return {
        session: session.id,
        round_id: id,
        status: ended?.status ?? 'cancelled',
        error: ended?.error ?? null,
        outputs: outputsOf(session.graph, ended, registry),
      };
    },

    async reset(asked) {
      const session = sessionAsked(asked);
      await session.reset();
      return session.view();
    },

    // -- what the built-in gui reads besides ----------------------------------

    // The gui as it was designed, and no more of the graph: its blocks are
    // what it draws, by the names they are called by.
    ...(part ? { gui: (asked: { session?: string }) => part.view(sessionAsked(asked)) } : {}),

    // Read-only on purpose: a deployed tool is configured by whoever runs it,
    // in the file beside it or its environment. A gui that wrote credentials
    // would put them in a file nobody asked for.
    async toolAiSettings() {
      // The function a run asks, so the gui says what a run calls.
      const { provider, model } = await aiSetting();
      // Whether the file is there, not where: any caller on the network may ask.
      return { provider, model, settings_file_exists: existsSync(settingsPath()) };
    },

    // The one picker, the editor's too: folders, the parent and the drives, so
    // whoever was handed the tool can move about. A `local` route: it is the
    // person at the keyboard, browsing their own machine.
    async browse(asked) {
      try {
        // Empty path means the tool's own folder -- where its graph and the
        // data beside it live -- rather than wherever it happened to be
        // started; for the editor, where it was started (`toolRoot`).
        return await browse(asked.path ?? '', extensionFilter(asked.extensions ?? ''), toolRoot);
      } catch (error) {
        throw new Refusal(error instanceof NotFound ? 404 : 400, message(error));
      }
    },
  };
}
