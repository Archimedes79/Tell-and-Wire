// The reference client of the GUI port (`port.ts`, "The GUI port" in docs/architecture.md): what a page written by hand uses to meet its tool.
//
// Served by every tool at /tw/port.js, so a project's own page (`frontend/index.html`) or any site on the tool's origin can
//
//     import { connect } from '/tw/port.js';
//     const tool = await connect();
//
// and needs no build, no package and no path of the runtime API written in it: the connection points are read from the tool
// (`GET /api/runtime/port`), by name. It is the same port the built-in GUI uses -- another client of it, nothing more.
//
//     const { interface: what, gui } = await tool.describe();      // describe: what the tool offers, by name
//     const started = await tool.start('picked', { values: { pick: 'b' } });   // start: begin a round ...
//     const stop = tool.watch({ session, round });                  // return: ... and hear what comes of it, whoever began it
//     const answer = await tool.call('picked', { values: { pick: 'b' } });     // or start and wait: a function call
//     await tool.states.save('Tuesday');                            // state: keep it for later
//
// Plain JavaScript on `fetch` (and `EventSource` where there is one: where not, the session is asked for every half second).

/** What the tool refused, in its own words (`{ detail }`), as an Error. */
export class PortError extends Error {
  constructor(status, detail) {
    super(detail || `The tool answered ${status}.`);
    this.status = status;
  }
}

/**
 * Meet the tool at *base* (this page's own origin when none is given): read its connection points and answer a client of them.
 * @param {{ base?: string, session?: string, fetch?: typeof fetch }} [options] `session`: ask about one session; `fetch`: another transport.
 */
export async function connect(options = {}) {
  const base = (options.base ?? '').replace(/\/$/, '');
  const send = options.fetch ?? ((...args) => globalThis.fetch(...args));

  const request = async (method, path, body) => {
    const response = await send(`${base}${path}`, method === 'GET' || body === undefined ? { method } : {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const answer = await response.json().catch(() => ({}));
    if (!response.ok) throw new PortError(response.status, answer.detail);
    return answer;
  };

  const { version, points } = await request('GET', '/api/runtime/port');

  /** Call a connection point by name: its `:params` filled in from *given*, the rest on the query (GET) or in the body. */
  const at = (name, given = {}) => {
    const point = points[name];
    if (!point) throw new PortError(404, `This tool has no connection point "${name}".`);
    const rest = { ...given };
    if (options.session !== undefined && rest.session === undefined) rest.session = options.session;
    const path = point.path.replace(/:([a-z_]+)/g, (_, key) => {
      const value = rest[key];
      delete rest[key];
      return encodeURIComponent(String(value ?? ''));
    });
    if (point.method === 'GET') {
      const query = new URLSearchParams(Object.entries(rest).filter(([, value]) => value !== undefined && value !== null).map(([key, value]) => [key, String(value)])).toString();
      return request('GET', query ? `${path}?${query}` : path);
    }
    return request(point.method, path, rest);
  };

  return {
    /** The port's version, and every connection point by name (role, method, path, summary, local). */
    version,
    points,

    // -- describe -------------------------------------------------------------
    /** What the tool offers, by name; and its GUI as designed, for a tool that has one (else null). */
    describe: async () => ({ interface: await at('interface'), gui: points.gui ? await at('gui') : null }),

    // -- start ----------------------------------------------------------------
    /**
     * Begin a round at start point *event* (the whole graph for none) with *ask* -- `{ values, answers, by }`. A round that still needs
     * something (a file nobody chose) is not begun: `{ needs }` says what. Otherwise `{ round_id, total, session }`; the answer comes back by `watch`.
     */
    start: async (event, ask = {}) => {
      const needs = await at('requirements', { event, ...ask });
      return needs.length ? { needs } : at('startRound', { event, ...ask });
    },
    /** Begin a round and wait for what it hands back, by name. */
    call: (event, ask = {}) => at('runRound', { event, ...ask }),
    stop: (id) => at('stopRound', { id }),
    /** Start over: forget what using the graph left behind. */
    reset: () => at('reset'),

    // -- return ---------------------------------------------------------------
    session: () => at('session'),
    round: (id) => at('round', { id }),
    /**
     * Hear what the tool tells: *session* gets the session on connect and after every change, *round* each round as it starts, goes and ends.
     * Returns how to stop.
     */
    watch({ session, round } = {}) {
      if (typeof globalThis.EventSource === 'function') {
        const stream = new globalThis.EventSource(`${base}${points.stream.path}${options.session ? `?session=${encodeURIComponent(options.session)}` : ''}`);
        if (session) stream.addEventListener('session', (event) => session(JSON.parse(event.data)));
        if (round) stream.addEventListener('round', (event) => round(JSON.parse(event.data)));
        return () => stream.close();
      }
      // No EventSource here: the session is asked for, and told when it changed -- and the round it names, as it goes.
      let stopped = false;
      let last = '';
      const poll = async () => {
        if (stopped) return;
        try {
          const view = await at('session');
          const seen = JSON.stringify(view);
          if (seen !== last) {
            last = seen;
            if (session) session(view);
            if (round && view.round) round(view.round);
          }
        } catch {
          // The tool did not answer this time: asked again.
        }
        if (!stopped) setTimeout(poll, 500);
      };
      void poll();
      return () => { stopped = true; };
    },

    // -- state ----------------------------------------------------------------
    states: {
      list: async () => (await at('states')).states,
      save: (name) => at('saveState', { name }),
      load: (name) => at('loadState', { name }),
    },

    // -- files ----------------------------------------------------------------
    files: {
      browse: (path = '', extensions = '') => at('browse', { path, extensions }),
      find: (name, size) => at('findFile', { name, size: String(size) }),
    },
  };
}
