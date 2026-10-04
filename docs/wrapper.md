# The wrapper

AI-Graph is three layers. A **graph core** runs graphs. The **wrapper** around it holds
the graph in use and talks to everything outside. **Frontends** talk only to the
wrapper: a tool's page (or any program that uses a graph) and the graph editor.

```
 a tool's page, a script,            the graph editor
 any frontend (GUI)                  (graph design frontend)
        │  runtime API                       │  design API
        │  /api/runtime/…, by name           │  /api/graphs/…, /api/ai/…, /api/execute/…
        ▼                                    ▼
 ┌────────────────────────────── wrapper (engine/src/host) ─────────────────────────────┐
 │ the session: what nodes keep, the page and what its blocks hold, state.json,          │
 │ the clock, the queue of rounds; the graph definition's rules: start points,           │
 │ end points, packages; the editor's files, ✨ generation, settings, deploy             │
 └──────────────────────────────────────┬────────────────────────────────────────────────┘
                                        │  core protocol (engine/src/core/protocol.ts)
                                        ▼  in this process, or a program on stdin/stdout
 ┌──────────────────────── graph core (engine/src/core, JavaScript) ─────────────────────┐
 │ runs a round, one node, a node's example; what every node made last (the latch);      │
 │ the reuse cache; asks the model with its own client                                   │
 └────────────────────────────────────────────────────────────────────────────────────────┘
```

The graph definition the wrapper hands a core is the project folder's: `flow.json`, each
node's `node.json` and its files, `interface.json`. A core reads the same definition
whatever its language. Today there is one core, in JavaScript.

## The runtime API: a GUI uses a graph by name

For a tool's page, a page of your own (`frontend/`), a script. It knows start points and
end points by name and never a node. Every route answers JSON except the stream.

| Route | What it does |
|---|---|
| `GET /api/runtime/interface` | What the graph offers: its start points (with what the graph reads of what each is sent) and its end points |
| `GET /api/runtime/session` | The session now: what each start point was sent, what the outputs showed, the page, the round, the clock |
| `GET /api/runtime/stream` | Server-sent events: `session` on connect and after every change, `round` as each round starts, goes and ends |
| `POST /api/runtime/requirements` | What a round started from the page still needs (a file nobody picked) |
| `POST /api/runtime/rounds` | Start a round at a start point, sent values; answers its id at once |
| `GET /api/runtime/rounds/:id` | One round as it goes, and what it handed back by name once it ended |
| `POST /api/runtime/rounds/:id/stop` | Stop it |
| `POST /api/runtime/run` | Start a round and wait for what it hands back |
| `POST /api/runtime/reset` | Forget what using the graph left behind |
| `GET /api/runtime/page` | The page: its blocks as designed, and how they connect by name |
| `GET /api/runtime/ai-settings` | Which model the tool asks, without its key |
| `POST /api/files/browse` | A folder's entries, for a file picker |

The types are `host/api.ts` (`API`, each route marked `tool`).

## The design API: the graph editor designs a graph

For the editor and nothing a tool carries: a bundle leaves `host/editor/` behind.

| Route | What it does |
|---|---|
| `POST /api/graphs/file/load`, `POST /api/graphs/file/save` | Open and save a graph or a project folder |
| `GET /api/graphs/find`, `GET /api/files/find` | Find projects and files to open |
| `GET /api/graphs/file/changes` | What changed on disk since the editor last asked |
| `POST /api/runtime/hold` | Hand the document being edited to the session, which goes on with it |
| `POST /api/runtime/application/start`, `POST /api/runtime/application/stop` | ▶ Run and ■ Stop: the clock and what starts by itself |
| `POST /api/execute/node` | ▶ one node on given inputs |
| `POST /api/execute/inputs` | What would arrive at a node now |
| `POST /api/execute/example` | ▶ Try: a node on the example its input.js holds |
| `POST /api/graphs/rounds/keep` | Keep a round that ran through as a test of the project |
| `POST /api/ai/generate`, `GET /api/ai/generate/progress` | ✨: write one of a node's files, and watch it being written |
| `POST /api/ai/generate-graph` | ✨ AI Graph: design or change a whole graph from a description |
| `GET /api/ai/settings`, `POST /api/ai/settings`, `GET /api/ai/providers` | The one AI setting and the providers to choose from |
| `POST /api/deploy/bundle` | Write the tool as a bundle, or a zip of it |
| `POST /api/files/open-external` | Open a node's file in the person's own editor |

The types are `host/api.ts` (each route marked `editor`); the handlers are
`host/editor/routes.ts`.

## The core protocol: the wrapper runs a graph

What the wrapper asks of a graph core (`core/protocol.ts`, `GraphCore`). One core serves
one session: what every node made last lives in it between rounds.

| Operation | Asked with | Answers |
|---|---|---|
| `hello` | -- | `protocol` (1), `language`, `core` |
| `open` | `held`: what every node was last left holding (state.json) | nothing |
| `round` | `graph` as the round starts from it, `trigger` (a start point, or none for the whole graph), optionally `given` (known outputs) and `offline` (ask no model) | `result`; `nodes`: what every node keeps after it; `held` |
| `node` | `graph`, `node`, optionally `inputs` | the inputs it ran on, and its result |
| `example` | `graph`, `node`, `offline` | how it did on the example its definitions hold |
| `test` | `graph`, `offline`, `only` | every node's example, at every depth |
| `arriving` | `graph`, `node` | what would arrive at it, and the upstream run |
| `forget` | -- | nothing: what it keeps between rounds is gone (a reset) |
| `stop` | `of`: the request to stop | whether there was one; the stopped request still answers |

While a `round` goes, the core sends events: first `{ "type": "plan", "total": n }`
(how many nodes it runs), then the executor's `node_start`, `node_done`, `batch` and
`activity`.

**As a program of its own**, a core speaks the same operations on stdin and stdout, one
JSON object per line. The wrapper writes `{ "id": 7, "op": "round", … }`; the core writes
any number of `{ "id": 7, "event": … }` and then `{ "id": 7, "reply": … }` or
`{ "id": 7, "error": "…" }`. Nothing else goes to stdout; what a core says for people
goes to stderr. It ends when stdin ends.

`node engine/src/main.ts core` is the JavaScript core as such a program. The wrapper runs
its graphs in one when `AI_GRAPH_CORE` names it, a program and its arguments:

```bash
AI_GRAPH_CORE="node engine/src/main.ts core" node engine/src/main.ts --editor editor/dist
```

Without it the core runs inside the wrapper's process (`core/localCore.ts`).

**What every core must do**, whatever its language (`core/protocol.ts` says the same):

- answer `hello` first and at once -- the wrapper refuses a core that does not answer within
  15 s, or speaks another `protocol` -- and is started again when asked after it ended;
- read requests while one goes: a `stop` arrives in the middle of a round;
- run on the same files as the wrapper: paths in a graph resolve against the same working
  directory;
- keep what every node made last between rounds: `held` comes in with `open` (from
  state.json) and goes back with every round, a value the wrapper stores and never reads;
  what a round left is committed only when it ran to its end;
- say in `nodes` each node's state as its kind keeps it: a start point's `values`, a data
  node's `data_value` (`NodeRunner.state`);
- run a round with `given` as a kept round: those nodes are handed their outputs instead of
  running, and nothing of it stands for the next round -- no latch, no reuse;
- end when stdin ends, stopping what still goes; say an error as a sentence.

The shapes of what is asked and answered -- `Graph`, `Trigger`, `ExecutionResult`,
`NodeResult`, `ExampleRun` -- are the engine's types (`graph.ts`, `execution/triggers.ts`,
`authoring/examples.ts`), as JSON.

**What a core does not do:** the page, the session, state.json, the clock, the queue of
rounds, HTTP. It is handed a graph with what the round was sent already in its start
points and what nodes keep already in them, and it changes nothing it was handed.

**A core in another language** is correct when it runs the examples the way this one does:
`node engine/src/main.ts test examples/<name> --offline` with `AI_GRAPH_CORE` naming it
runs each node's example and replays the project's kept rounds (`tests/*.json`), which
came from real runs. Its model client reads the same AI setting as the wrapper
(`ai-settings.json`).

## What holds it

- `engine/src/core/core.test.ts`: a round, a stopped round, the wire format, and a kept
  round replayed by the core in this process and by `node engine/src/main.ts core` with
  the same answer.
- `engine/src/host/session.test.ts`, "a session whose rounds run in a graph core of its
  own process".
- `engine/src/core/wrapperDoc.test.ts`: every route of `host/api.ts` and every operation of
  the protocol is in this page.
