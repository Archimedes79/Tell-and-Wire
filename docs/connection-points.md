# Connection points

Where something else meets AI-Graph: another page, a script, a model over MCP, a body
in a process of its own. There are four. Each section says what crosses the point, which code holds it,
and which test holds each claim. How AI-Graph works inside is
[architecture.md](architecture.md).

```
                  design                                    in use
  the editor ──▶ ① the folder ──▶ the engine ◀── ③ the runtime API ◀── a page, a script
  a person                           │   ▲            (HTTP, JSON)
                                     │   └── ② the graph's names: what ③, the CLI and MCP speak
                                     ▼
                          ④ a body, in a process of its own
```

| | What crosses it | Who is on the other side | Held by |
|---|---|---|---|
| ① The folder | the design, at rest | the editor, the CLI, MCP, a text editor | `project/folder.test.ts`, `project/interfaceFile.test.ts`, `examples.test.ts` |
| ② The graph's names | what a graph offers: its start points and its end points | every caller, the page among them | `execution/graphInterface.test.ts`, `elements/page.test.ts` |
| ③ The runtime API | a graph in use: rounds, the session, the stream | a page in a browser, a script | `host/runtimeApi.test.ts`, `host/frontend.test.ts`, `host/serve.test.ts` |
| ④ The body protocol | one call of a node's code | a body in a process of its own | `core/node.test.ts`, `core/sandbox.test.ts` |

Test paths are under `engine/src/` unless they say otherwise.

What crosses a point is all the other side has to speak -- files of JSON and text, names,
JSON over HTTP, lines of JSON -- and none of it is AI-Graph's code. Some of the tests meet
a point from outside, as anything else that spoke it would: `host/runtimeApi.test.ts` and
`host/frontend.test.ts` over HTTP, `core/node.test.ts` through ④'s lines, and
`examples.test.ts` with a folder in and a bundle run from its own folder. They check what
crosses, not how the engine does it.

## The folder

A graph is a folder of JSON and plain text: nothing in it needs the engine to be read.
Each fact is in one place ([A graph on disk](architecture.md#a-graph-on-disk) has the
whole of it):

```
flow.json                 the graph's name and description, which nodes there are (id → type),
                          and every wire, one line each: "send.data -> assistant.message"
nodes/<id>/node.json      the node's heading, text and settings -- only what differs from the default
nodes/<id>/interface.json its ports: { "port", "name", "type", "list"?, "required"?, "field"? },
                          inputs and outputs
nodes/<id>/input.js …     each piece of writing in a file of its own: input.js, output.js,
                          code.js, prompt.md, data.json or data.txt, history.md
page/page.json            the page: its blocks, in order, each connected to the graph by name
layout.json               positions only
frontend/                 a page of the project's own (③)
```

- `flow.json` says the flow and nothing about any node, and a node's folder nothing
  about its neighbours (`project/folder.test.ts`: "says the flow once, in flow.json, and
  nothing about any node there", "keeps a node's settings in its node.json and its ports
  in its interface.json"; `project/interfaceFile.test.ts`: "says what goes in -- and what
  of a package an input takes -- and what comes out: nothing about its neighbours").
- The page is no node: `page/page.json` holds its blocks alone, and `flow.json` names none
  of them. A block says by name which start points its data goes to (`sends_to`), which
  one using it fires (`fires`) and which end point it shows (`shows`)
  (`project/folder.test.ts`: "keeps the page beside the nodes, in page/, as its blocks
  alone: no node, and nothing flow.json names"; `elements/page.test.ts`: "takes who it is,
  how it is drawn and how it connects, and leaves the rest as its settings").
- Which setting is which file is the element's to say (`NodeRunner.texts`), and every file
  is there from the start (`project/folder.test.ts`: "keeps each piece of writing in a
  file named for what it is", "writes every file a node has from the start: a stub for what
  it holds nothing of, which reads back as nothing").
- Read and written back, a folder is the same bytes (`project/folder.test.ts`: "reads back
  exactly what was written", "writes the same bytes for the same graph, so an unchanged
  save is no change").
- What a folder gets wrong is one list, `check` (`project/check.ts`,
  `project/folderCheck.ts`), for the CLI, the MCP server and the editor alike, and what is
  wrong with the page is in it too (`pageProblems` in `elements/page.ts`).
- `state.json` beside it is not the project's: what using the graph left behind
  (`host/session.test.ts`: "is not the project's: a save and a check leave state.json
  alone, and a bundle never carries it").
- The examples are folders the tests read, run and deploy (`examples.test.ts`), and the
  three master examples can be built by hand in the editor
  (`editor/src/masterExamples.test.ts`).

## The graph's names

What a graph offers whoever uses it from outside, by name -- never by node or port
(`execution/graphInterface.ts`; each element says what it offers, `NodeRunner.offers`):

- There is one way in and one way out: **events** are its start points, **outputs** its
  end points, each named by its node's id. A block of the page is no name: it connects
  itself to them (`execution/graphInterface.test.ts`: "names its start points and end
  points by their ids, with no port in sight -- and who starts each event", "offers no
  block: a block connects itself to the names, it is not one").
- Each event says who starts it -- the page, a call, the graph itself (`started_by`) --
  and what the graph reads of what it is sent (`reads`): each part an input wired from it
  takes, by its `field`, typed as that input takes it. That is what a caller sends. A start
  point the page starts says as well which blocks fire it (`fired_by`) and what the page
  sends with it (`sends`), so a script can start it in the page's place ("says what the
  graph reads of what a start point is sent: each part a node takes, once, typed as it
  takes it", "says of a start point the page starts which blocks fire it and what the page
  sends with it").
- An event names the start point a round begins at, and a round given none runs the whole
  graph ("starts the round an event names -- none is the whole graph -- and refuses one it
  does not offer").
- What a round is sent goes to that start point as one package, `{event: {name, by},
  values}`, the values under the names the sender gave them, taken as they come: the first
  node reads what it needs. A round of the whole graph is sent nothing, and values sent
  with one are refused, all of them, before anything runs ("goes to the start point it
  fires as one package, under whatever names the sender gave it", "is nothing, for a round
  of the whole graph: no start point takes it -- and what is sent then is refused, all of
  it").
- What each start point was sent last is kept under its name ("is, by its name, what the
  last round it began was sent -- its design's until then").
- An output is what arrived at an end point the round reached ("outputs by name": "are
  what arrived at each end point", "leave out what the round did not reach").
- A name is a node's id, which no other node has: `check` names a second one
  (`host/editor/mcpServer.test.ts`: "names a duplicated node id").

The page speaks these names like any caller. A round it starts is sent the data of every
block whose `sends_to` names the start point, under the block's id, and what reaches an end
point is settled into the blocks that show it (`elements/page.ts`; `elements/page.test.ts`:
"is the data of each block that sends to the start point, under the block's id", "is
settled into the blocks that show each end point, and said as each is drawn"). `check`
names a block connected to nothing, a point the graph lacks, a start point the page starts
that nothing on the page fires, and an input that takes a part no block sends ("what is
wrong with a page").

The same names are spoken everywhere a graph is used: the runtime API (③); the command
line, `--event measure --value paragraph=…` (`cli/cli.test.ts`: "a round by name, as a page
asks for one"); the MCP server's `run_graph` and `describe_graph`
(`host/editor/mcpServer.test.ts`: "sends values to the start point the event names, and
refuses them for a round of the whole graph", "says what a graph offers by name: its start
points, with what it reads of what each is sent, and its end points"); and the questions a
round the page starts asks before it runs, each answered under the id of the block that
asks (`host/session.test.ts`: "what a round asks before it runs"). A graph inside a node
meets the graph above it the same way: its start points -- but one that starts itself --
and its end points are the ports of the node that holds it, and what arrives on a port is
sent to the start point of that name, under that name (`elements/nodes/subgraph/boundary.ts`,
`NodeRunner.answerWith`; `elements/nodes/subgraph/SubgraphNodeRunner.test.ts`: "sends what
arrived on a port to the start point of that name, under its name, as the graph above",
"has only its start points and end points for ports: there is one kind of way in and out").

## The runtime API

A graph in use, over HTTP and JSON: the `tool` rows of the one route table,
[`host/api.ts`](../engine/src/host/api.ts). Every server answers them -- the editor and a
deployed tool alike -- and a deployed tool answers nothing else (`host/serve.test.ts`:
"serves a deployed tool its own routes of the contract, and none of the editor's").

| Route | What it is for |
|---|---|
| `GET /api/runtime/interface` | The names (②) -- each start point with who starts it and what the graph reads of what it is sent, each end point -- the graph's name and description, and the session's id |
| `GET /api/runtime/page` | The page as it was designed -- name, description, colour scheme, blocks -- whether opening it runs the graph whole once (`starts_whole`), and which design it is (`design_revision`) |
| `GET /api/runtime/session` | What using the graph left: what each start point was sent last (`sent`), what each end point handed back (`outputs`), what each block holds and shows (`page`, `shown`), what differs from the design -- each node's slots and the page's, what a reset forgets (`kept`) --, how many rounds ran, the round going or last, the clock -- and which design the server holds (`design_revision`), so a page drawn from it is drawn again when it changes |
| `GET /api/runtime/stream` | Server-sent events: `session` on connect and after every change, `round` as each round starts, goes and ends |
| `POST /api/runtime/requirements` | `{ event, values, by }`: what a round the page starts would still ask before it runs -- a picker with nothing chosen -- each under the id of the block that asks it. Any other round asks nothing |
| `POST /api/runtime/rounds` | `{ event, values, answers, by }`: start a round, answered at once with its id; watch it on the stream or at `GET /api/runtime/rounds/:id`, where every snapshot says what began it (`started`: the start point and who sent it, null for a round of the whole graph) |
| `POST /api/runtime/rounds/:id/stop` | Stop it, whoever started it |
| `POST /api/runtime/run` | The same round as a function call, answered once it ended: `{ session, round_id, status, error, outputs }` |
| `POST /api/runtime/reset` | Forget what using the graph left behind: it is as designed again |
| `GET /api/runtime/ai-settings` | Which model a run calls, read-only |
| `POST /api/files/browse` | A file picker's listing, for the person at the keyboard: loopback only |

- A graph is a function with memory: a round goes in with an event and values, outputs
  come out, and what it leaves is the session's, kept in `state.json` -- written only when
  a round ran to its end ([State](architecture.md#state); `host/runtimeApi.test.ts`: "runs
  the same start point for a script in the page's place: a function call, sent what it
  sends", "forgets on reset what using the graph left behind").
- A round is asked for with `{ event, values, answers, by }` (`RoundRequest` in
  `host/api.ts`). With `by`, a block of the page, it is a round the page starts: refused
  unless that block fires the start point, its `values` are what the page's blocks hold,
  by block id, and the start point is sent what the blocks that send to it hold. Without
  `by` it is a call, and `values` are the start point's package as they come. `answers`
  answer what `requirements` asked, under the asking block's id, and one nobody asked is
  refused (`host/session.test.ts`: "is refused when the block does not fire the start
  point, or a value is for a block that takes none", "takes an answer into the block that
  asked, and refuses one to a question nobody asked").
- Every route that asks about the session takes its id -- the server's own when left out
  -- and turns another down with 404 and the advice to ask for the interface again
  ("answers for its own session only"). A name the graph does not offer is 400, saying
  which it does, and so are values for a round of the whole graph and a block that does not
  fire the start point ("turns down a name the graph does not offer, saying which it
  does"). A graph that could not run -- a cycle, say -- is 422 from `run`; a round started
  by `rounds` says so in its own record, as `error` ("says a graph that could not run as
  one"). A refusal is `{ "detail": "…" }`.
- The stream tells every round, whoever started it: this page, another tab, the clock
  ("streams the session on connect, then each round as it starts and ends, whoever started
  it").
- A request's body is JSON, sent as `application/json`, from the server's own origin, to a
  loopback name unless the server was bound wider (`foreignRequest` in `host/http.ts`;
  `host/serve.test.ts`: "a web page elsewhere in the same browser").
- One session per server; its id travels in every route ([State](architecture.md#state)).
- A project's `frontend/index.html` is served at `/` in place of the built page, and a
  bundle carries it. The example one calls nothing else (`host/frontend.test.ts`: "in the
  example, calls nothing but the runtime API any frontend may call", "runs the example by
  name: the paragraph in, the report out"). The built-in page is a frontend like any
  other: it holds no graph (`editor/src/runtime/boundary.test.ts`: "reaches nothing in
  store/: a tool holds no graph, draws no canvas, writes no node, has no editor around
  it"), the browser draws a block from the page as designed (`GET /api/runtime/page`), and
  for a start point a call starts it draws what a caller sends: a box for each part in
  `reads`, filled with what `sent` says it was sent last, and a button that starts it
  (`editor/src/page/CallForms.tsx`; `editor/src/page/CallForms.test.ts`).

## The body protocol

How a node's code is run: `elements/body.ts` (`runBody`) decides when, `core/node.ts`
(`nodeCode`) how.

- A body is `code.js`: `async function run(inputs, node)`, returning an object keyed by
  output port (`core/node.test.ts`: "returns what the body returned";
  `elements/body.test.ts`).
- It runs in a process of its own under Node's permission model: files yes; other
  programs, native addons and workers no. The network is not closed: Node has no flag for
  it (`core/sandbox.test.ts`: "may still read and write files", "may not start another
  program").
- No key reaches it: its environment holds no credential, and a model is asked through
  `node.llm`, answered by the process that holds the graph ("is handed no key of the
  process that runs it: it asks through node.llm").
- What travels are lines of JSON, with nothing JavaScript about them
  (`core/node.test.ts`: "a body that asks the process holding the graph", "a body that
  does not keep to the protocol"):

  ```
  stdin   {"inputs": {…}, "calls": ["llm", …]}                       one line: what it is handed
  stdout  ␞ai-graph:call {"id": 1, "name": "llm", "args": …}          a question, on a line of its own
  stdin   {"id": 1, "result": …}   or   {"id": 1, "error": "…"}       its answer
  stdout  ␞ai-graph:result {…}                                        what it made; the run is over
  ```

  `␞` is U+001E. Anything else a body prints is its own ("may print what it likes: only
  the marked line is its result"); a body that ends without the result line has failed,
  and its error is counted in its own lines ("the sandbox").
- What one call is handed and returns is written down beside the body, each with an
  example: `input.js` and `output.js`. Every run is held to `output.js`
  (`execution/interface.test.ts`: "a run held to its output.js").
