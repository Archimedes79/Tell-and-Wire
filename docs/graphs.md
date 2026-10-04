# Building graphs

The graph format, the start and end points where a graph meets whoever uses it, the code
and AI nodes that do the work, and the page of blocks that gives a graph a window of its
own.

## The graph document

A graph is nodes, ports and wires, and the page it is used through. Saved under a name it
is a [folder](#a-project-is-a-folder); the same document as **one `.json` file** has
everything inline: **Save as…** with a name ending in `.json`, **File ▸ Copy / paste as
JSON…**, what `POST /api/ai/generate-graph` returns, and what the MCP server's graph tools
take ([mcp-server.md](mcp-server.md)). It is also what the editor and the engine hold in
memory (`engine/src/graph.ts`). Here is [examples/chat](../examples/chat/) as one
document, shortened -- positions, most descriptions, the end point's `path` port and the
model's three texts left out:

```json
{
  "metadata": { "name": "Chat", "description": "A chatbot is a chat block and a model. …" },
  "nodes": [
    {
      "id": "send", "node_type": "start", "label": "Send", "config": {},
      "outputs": [{ "id": "data", "name": "Data", "kind": "output", "data_type": "json", "multi": false, "required": false, "description": "…" }]
    },
    {
      "id": "assistant", "node_type": "ai", "label": "Assistant",
      "description": "Answers the last message, knowing the conversation so far",
      "config": { "prompt": "…", "input_definition": "…", "output_definition": "…" },
      "inputs": [
        { "id": "history", "name": "History", "kind": "input", "data_type": "text", "multi": false, "required": false, "description": "", "field": "chat.history" },
        { "id": "message", "name": "Message", "kind": "input", "data_type": "text", "multi": false, "required": true, "description": "", "field": "chat.message" }
      ],
      "outputs": [{ "id": "output", "name": "Reply", "kind": "output", "data_type": "text", "multi": false, "required": false, "description": "" }]
    },
    {
      "id": "reply", "node_type": "end", "label": "Reply", "config": {},
      "inputs": [{ "id": "value", "name": "Value", "kind": "input", "data_type": "any", "multi": true, "required": false, "description": "" }]
    }
  ],
  "edges": [
    { "id": "send.data -> assistant.message", "source_node_id": "send", "source_port_id": "data", "target_node_id": "assistant", "target_port_id": "message" },
    { "id": "send.data -> assistant.history", "source_node_id": "send", "source_port_id": "data", "target_node_id": "assistant", "target_port_id": "history" },
    { "id": "assistant.output -> reply.value", "source_node_id": "assistant", "source_port_id": "output", "target_node_id": "reply", "target_port_id": "value" }
  ],
  "page": {
    "blocks": [
      { "id": "chat", "kind": "chat", "w": 16, "h": 10, "tone": "plain", "sends_to": ["send"], "fires": "send", "shows": "reply" }
    ]
  }
}
```

A node needs an `id` and a `node_type`, an edge its id and both ends; whatever else a file
leaves out has a default (`parseGraph`). `metadata` holds the graph's `name`, its
`description` and `gui_scheme`, the page's colour scheme: `night`, or `paper`, `office`,
`anthracite`, `graphite`. `page` holds the page's blocks, in order; a graph a script uses,
or one a node holds, has none ([The page](#the-page)). A port's `data_type` is `text`,
`number`, `boolean`, `json`, `list`, `file_path`, `image`, `binary` or `any`; `multi` says
it carries a list; and an input's `field` names the part of a start point's package it
takes ([Start points](#start-points)). A node's `config` is its settings, and each kind
reads its own keys (`editor/src/document/baseNodeConfig.ts` holds the default of each key
that has one):

| `node_type` | Settings in `config` |
|---|---|
| `start` | `started_by` (`page`, the default, `call` or `itself`); for one that starts itself, `on_start` (true unless set false) and `every` (empty: never); `values`, what it is sent while nobody has sent it anything |
| `folder` | `path` (the folder it lists), `extensions`, `recursive`, `catch_errors` |
| `ai` | `prompt`, `input_definition`, `output_definition`, `ai_provider`, `ai_model`, `temperature`, `send_images`, `mcp_servers`, `batch_mode`, `batch_concurrency`, `catch_errors` |
| `code` | `code`, `input_definition`, `output_definition`, `batch_mode`, `batch_concurrency`, `catch_errors` |
| `data` | `data_format` (`text` or `structure`), `data_value` |
| `end` | `write_mode` (`none`, `file` or `directory`), `path` (where it writes) |
| `subgraph` | `subgraph` (the graph it holds), `batch_mode`, `batch_concurrency`, `catch_errors` |

`batch_mode` is `whole_list`, or `per_item` for a node that runs once per item; a code or
AI node also keeps what ✨ worked from -- `history`, `prompts`, `input_files`,
`output_files`. The ports of a `start`, a `folder` and a `subgraph` node are the engine's
(`derivedPorts`): a start point's one `data`, a folder node's from its settings, a
subgraph's from the graph inside. They are written as they follow, never by hand -- all
but the part of a package an input takes, which is kept when they are derived again
(`keepingFields`, `engine/src/elements/port.ts`). Every other kind names its own ports: a
code or AI node's are what its code or its prompt works with, a data node's are `input`
and `output`, and an end point's inputs, all but `path`, are what it hands back.

A **start point** is where a round begins and an **end point** where it ends: the one way
into a graph and the one way out, each by its id ([What starts a graph](#what-starts-a-graph)).
A constant the graph holds is a data node, and whatever a person or a caller gives arrives
in a start point's package. A **folder** node lists the files in a folder: on `files` their
paths, sorted -- of the types `extensions` names (`.csv, .txt`, compared without regard to
case), and its subfolders' too with `recursive` -- and on `count` how many. A path wired
into its `path` input is listed instead of its own, and with `catch_errors` a folder that
cannot be listed puts the reason on an `error` output instead of failing the run
(`engine/src/elements/nodes/folder/FolderNodeRunner.test.ts`). It reads no file. A node that
wants a file's text reads it at its own input -- the *Read the file at this path* box on an
input of a code or AI node, which types it `file_path` -- and a path wired in there names
the file, or each file of a list. What it reads there is what is in the file
(`elements/documents.ts`): text as text; a Word document (`.docx`) as its text in Markdown,
its headings, lists, emphasis and tables kept; a picture or a PDF as itself, a `data:` URL,
which an AI node sends to its model as the file it is -- a model that reads PDFs reads a
statement in whatever layout it came. A file picker on the page reads its file the same way
and sends what it read ([The page](#the-page)).

A **data** node is a value that survives the run: its kind (`data_format`, text or
structure) and what it holds (`data_value`, kept in `data.json` or `data.txt`). Its panel
is its text and that value -- **✨ Data** writes the value from the text, shaped as the
nodes it feeds want it (asked for text where it is kept as text, for JSON where it holds
structure; a text node answered with a JSON list, record or number becomes a structure):
what is typed is in the graph as it is typed, a structure that does not parse stays in the
box with the reason and is not stored, and a file dropped on the box — or on the node on
the canvas — is what it holds from then on (what the file says, parsed when it is JSON).
What the file holds is the value the tool starts with; what a run delivers into the node is
the session's, kept for the next round and not written back into the project
([State](architecture.md#state)).

**A loop goes through a data node.** A node that remembers may close a loop -- a counter is
a data node with a code node adding one to it: the edge back into it is left out of the
round's order, and what arrives on it settles into its value once the round has run, for
the next one (`memoryFeedbackEdges`, `engine/src/execution/executor.ts`;
`executor.test.ts` beside it, "settles a feedback edge into the node that remembers, for
the next round"). It keeps what an ordinary edge brings it too, loop or no loop
(`engine/src/execution/run.test.ts`, "keeps what an ordinary edge delivers to a data node,
loop or no loop"). A circle through
nodes that do not remember is a problem `check` names. The page closes no loop: it is no
node, and what its blocks send and show goes through start and end points.

**In the editor** each node is a card on the canvas: its kind, its id, its heading and the
start of what it should do, and after a run how it went; its ports are dots on its edges,
named while the pointer is on the card. A start point's card says who starts it -- *started
by the page*, *started by a call*, *by itself: at start · every 5m* -- and which blocks of
the page fire it (⚡) and send to it; an end point's card, which blocks show it, and the file
it writes to while it writes one (`editor/src/canvas/card.test.ts`). One click opens the
node's panel on the right, with everything the node is; ✕, Esc or a click on the empty
canvas close it, and a click on another node shows that one. A node added from the palette
-- clicked or dragged -- opens its panel at once, and the graph is shown with it -- whole,
while it fits; a graph opened or started anew is shown whole. The palette's groups are
Input (Start point), Processing (Folder, AI, Code, Data), Output (End point) and Structure
(Subgraph). The bar under the canvas says what to change, on the node selected or on the
whole graph ([below](#generating-whole-graphs-with-ai)).

---

## What starts a graph

A round begins at a **start point** and ends at the **end points** it reaches. That is the
one way in and the one way out, the same wherever a graph runs -- the editor, a delivered
tool, the command line, a script, a model over MCP -- and, for a graph inside a node, the
same to the graph above it (`engine/src/execution/graphInterface.ts`).

### Start points

A `start` node is a named start point. Its id is its name: whoever starts it calls it by
that. Who may start it is its setting (`config.started_by`):

| Started by | What starts it |
|---|---|
| **The page** (`page`, the default) | a block whose `fires` names it: a button pressed, Enter in a text box, a choice made, a file or a folder picked, a message sent. A graph with one is used through its page, and a bundle carries the page. |
| **A call** (`call`) | a script over the runtime API, a page of the project's own (`frontend/`), the command line's `--event`, a model over MCP (`run_graph`), the App tab standing in for any of them -- and, for a graph inside a node, the graph above |
| **Itself** (`itself`) | the tool starting (*When the tool starts*, `on_start`) and a clock (*Again every*, `every`: `45`, `30s`, `5m`, `2h`, `1d`), counted from the end of one round to the start of the next |

Its one output, `data`, hands on **one package**, `{event, values}`. A round started by the
file picker of [examples/population_plotter](../examples/population_plotter/) hands its
start point `draw` this:

```json
{
  "event": { "name": "draw", "by": "file" },
  "values": {
    "file": { "path": "…/examples/data/population.csv", "content": "Country,Population,Area_km2\nIndia,1450000000,3287000\n…" }
  }
}
```

`event` names the start point and who started it: a block of the page by its id, or --
where no block did -- `page` (a run of everything, on what the page holds), `call`,
`itself`, `graph` (the graph above) or `run`; which is why no block may have one of those
ids. In a round this start point did not begin, `event` is `null`. `values` is what the
sender sent, under the sender's names. In a round the page starts, it is what each block
that sends to the start point holds, by the block's id: a file picker `{path, content}`, or
only the path with `send: "path"`; a folder picker the list of the folder's files; a chat
`{message, history}`; a text box its text, a dropdown its choice, a slider its number. A
call sends names of its own, and the graph above sends `{"<start point id>": what reached
the port}`. A round it did not begin finds a start point holding what it was sent last,
which is the session's ([State](architecture.md#state)); until it is sent anything it holds
`config.values`, which the panel of one a call starts asks for as *What a call sends it,
for example* (`engine/src/elements/nodes/start/StartNodeRunner.test.ts`: "hands on one
package: the event the round began with, and what was sent, under the sender's names";
"keeps what it was sent last, and a round it did not begin finds it there, with no event").

**An input takes a part of the package by its `field`**: a dotted path into `values` --
`chat.message`, `file.content`, `paragraph` -- and is handed that value alone; an input
without one is handed the whole package (`fieldOf` and `collectInputs` in
`engine/src/execution/executor.ts`; `executor.test.ts`, "hands a port that takes one value
of what arrives only that value"). So a code node reads `inputs.csv` as the file's text, an
AI node is shown only the parts its inputs take, and a block added to the page changes the
package, never the wiring. In the editor an input wired from a start point says what it
*takes*: the whole package, what one block sends or a part of it, or a part of what a call
sends it for example. A new wire from a start point chooses for it -- of the one block that
sends there, the part the input is named after, else the part a node works on (a file's
content), else all it sends; of what a call sends, the part the input is named after, or
the one part there is; where several blocks send there, the whole package -- and types the
input as that part is (`defaultField`,
`editor/src/document/page.ts`; `editor/src/masterExamples.test.ts`, "a wire from a start
point a picker sends to").

### End points

An `end` node is a named end point: what is wired into it -- every input but `path` -- is
what the graph hands back, under its id. A block of the page shows it by that id (`shows`),
a script reads it by that id (the runtime API's `outputs`), and the graph above finds it on
the port of that id of the node that holds this graph. The run's result -- what the command
line prints -- keys it by its label, the name its card shows; run whole,
[examples/nested_statistics](../examples/nested_statistics/) ends in

```json
"outputs": { "Report": { "value": { "words": 32, "sentences": 2, "longest": "directions" } } }
```

Two end points with one label are a problem `check` names; until it is fixed the later one
is handed on under its label and its id, and neither value is dropped (`resultKeys`,
`engine/src/elements/NodeRunner.ts`; `executor.test.ts`, "keeps every output in the result
when two share a label: the first under it"). That value under its name is what an end point
**is**, every round: no place it is sent to, beside others. The page does not choose an end
point's destination -- a block chooses the end point it shows -- and a script, the command line
and `run_graph` read the same value by the same name. What an end point does besides is its
own, page or no page (in its panel, *Also write it to*): with `write_mode` `file` it also
writes what arrives to the file `path` names -- a text as it is, anything else as JSON --
and with `directory` each value, each item of a list, to a file of its own in that folder,
which then holds this run's values and no earlier run's. A path wired into its `path` input
wins over its own (`engine/src/elements/nodes/end/EndNodeRunner.test.ts`).

### What a round runs

A round runs from where its start point is wired to:

- the nodes its `data` is wired to, and everything downstream of them;
- everything upstream that those nodes need an input from, and whatever computes the ◆ of
  one of them that the start point does not open itself;
- and nothing else.

So a page whose *Summarize* button and *Plot* button fire two start points is two tools in
one window: pressing one does not run the other's model call, and what the rest of the
page shows stays as it was (`engine/src/execution/triggers.test.ts`, "runs one tool and
leaves the other alone"). A start point wired to nothing starts everything. A round of the
whole graph -- the command line without `--event`, ▶ Run on a graph that has no start
point, the graph inside a node -- runs everything and counts every start point as having
begun it; one the page starts is sent what the page holds now (`startFromPage`,
`engine/src/elements/page.ts`).

**Using a block, and what it holds, are two things.** A block that sends to a start point
puts what it holds into that start point's package whenever the start point fires; using
the block fires a round only where its `fires` names one. A dropdown that sends and does
not fire is a setting: changing it starts nothing, and the next round of its start point --
a button beside it -- picks the new choice up. When a block does fire, the moment is the one
a person means: a dropdown on choosing, a slider on letting go (or an arrow key) rather
than on every value it passes, a file picker on picking, a text box on Enter (Shift+Enter
is a new line), a chat on sending, a button on pressing. A text box that fires holds a
message, and is emptied once a round has delivered it; one that does not fire holds a
setting, and keeps it (`engine/src/elements/page.test.ts`, "is emptied once delivered when
it was a message, and kept when it was a setting or changed meanwhile"). A block sends to
and fires only start points the page starts, which `check` holds it to.

**A node with nothing to do is left alone.** If a port marked *required* is wired and
brought nothing — or, for an AI node, *every* wired input came up empty — the node is
skipped, what hangs off it is skipped, and the run is still a success
(`engine/src/execution/run.test.ts`, "a node with nothing to do"). A round on a chat nobody has typed into asks no model and
changes no conversation (`engine/src/examples.test.ts`, "chat: a click on Run with nothing
typed asks nobody and changes nothing"). A start point or a data node is never skipped for
that: the round it begins, or the value it keeps, is news by itself.

**What only has to be there is reused.** Of the nodes a round runs, the ones its start
point is wired to, and everything after them, always run fresh. A node upstream of them,
run only because they need its output, hands back what it produced last time -- a run of
it that went through whole -- when neither it, nor anything that arrived on its inputs, nor
the one AI setting has changed (`engine/src/execution/reuse.ts`; `triggers.test.ts`,
"reusing context"). On a page with two start points -- choosing a folder fires one, whose package goes to a model that
reads each file; changing the view fires the other, wired into a code node after the model -- a new view
runs the code node again on the model's answers, handed back as they were, and asks no
model. Its result says so (`reused`), and the round line counts it apart: *1 ran, 1 reused
its last result*. A file read at a node's input counts by what it says, so an edited file is read
anew; a node with nothing wired in reads the outside world and is never reused, nor is a
node that reads the outside world whatever arrives -- a folder node lists its folder anew,
fed its path or not (`NodeRunner.readsOutside`; `reuse.test.ts`, "lists the folder again
every round"); a start point is never handed back from an earlier
round, since an event is a moment (`gates.test.ts`, "an event is a moment"); and a round of
the whole graph reuses nothing.

**The ◆ is a gate.** Every node has one input nobody declares: the amber ◆ on the top edge
of its card (`__run` in the file); a start point's card has none, since rounds begin
there. What arrives on it is never handed to the node; it decides whether the node runs
this round. Wires into it are drawn dashed and amber.

- **Unwired**, a node runs whenever a round reaches it.
- **Wired**, it runs only in a round that opens it: the start point the round began at is
  wired to the node — on its ◆ *or* on a data input, so a node one start point feeds and
  another's ◆ hangs on runs in the rounds of both — or some node computed `true` onto the ◆
  in this round. Several wires are OR-ed. **Only `true` opens**; `"yes"` and `1` do not,
  and `check` reports a wire into a ◆ from a port declared as anything but a boolean (or
  `any`) (`engine/src/execution/gates.test.ts`, "the ◆ is a gate", "opens a gate with true
  and with nothing else").
- **A round of the whole graph** counts every start point as having begun it. "Run
  everything" runs everything.

**Filtering and routing is a code node.** Wire the start points' `data` into *named* inputs
that take the whole package, so the code knows which round this is -- a package's `event`
is set only in the round its start point began -- return booleans, and wire those into
other nodes' ◆. There is no filter node and no router node (`gates.test.ts`, "a code node
that returns booleans is a filter"):

```js
function run({ pressed, tick }) {
  return {
    draw:    !!pressed.event && pressed.values.kind === 'Chart',   // → the chart node's ◆
    refresh: !!tick.event,                                         // → the source node's ◆
  };
}
```

**What a node made last stands.** A node whose gate stayed shut does not run, but another
node may run in that round and need its output: a *Read* button fires a start point wired
into the reader's ◆, choosing a length fires one wired into the summarizer, and choosing a
length runs the summarizer while the reader does not. So an output stays on its wire until
its node runs again, and the summarizer reads the text as it was read (`gates.test.ts`,
"stays shut for another event, and what the node made last stands"). The canvas marks such
a node ‖, and its result says why. Four things follow:

- Before a gated node has ever run there is nothing to hand on, and what needs it waits —
  a length chosen before any file was read does nothing, and says so.
- A node fed only by nodes that stood still stands still too: nothing new reached it.
  Except one that keeps something of its own — a data node, a start point: the round a
  start point begins is news whatever its wires carry.
- Nothing is held inside a [subgraph](#subgraph-nodes): the same inner graph may sit in
  two nodes or run once per item, and one's last value is not another's. A gate in there
  that stays shut hands on nothing.
- It is the session's (`engine/src/execution/latch.ts`): kept in `state.json` beside the
  project, which is not part of it, so a restarted tool goes on from it; a node changed
  since is made again ([State](architecture.md#state); `engine/src/host/session.test.ts`,
  "is remembered across a restart").

Rounds of one graph run one after the other: a second round waits for the first to end,
so no round reads what another is halfway through replacing
(`engine/src/host/session.test.ts`, "runs one round at a time, whoever asked: the second
waits for the first").

[examples/file_summarizer](../examples/file_summarizer/) is the plain case: a file picker,
a *Length* dropdown and a *Summarize again* button all fire `summarize`, whose package
carries the file and the length; the reader takes `file.content` and `file.path`, the
summarizer `length` (`engine/src/examples.test.ts`, "file_summarizer: a change of length
summarizes the chosen file again, in the length chosen").

### Starting the application

**▶ Run runs the application**, as an IDE runs the program it builds — one button, in the
header, the same on every tab. What starting it runs is the graph's to say (`startEvents`,
`engine/src/execution/triggers.ts`; `triggers.test.ts`, "starting the application"): a
start point the page or a call starts waits for them; each start point that starts itself
and is set to start when the tool starts, starts, and each one with an interval keeps its
clock; and only a graph with no start point at all runs whole, once, as a program runs when
it is started. With a page, the **App** tab opens with the page's fields as they are set,
and the graph runs when the page is used. With a start point a call starts, the App tab
opens as its caller: for each such start point, a box for every part the graph reads of
what it is sent -- the interface's `reads` -- filled with what it was sent last, and a
button that starts it (`editor/src/page/CallForms.tsx`; the delivered page draws the same).
While it runs the button is **■ Stop**, which ends it; a graph with nothing left to happen
-- no page to use, no call to make, no clock that ticks -- ends by itself, and opening
another graph ends it too (`editor/src/app/application.test.ts`). It is the document that
runs: pressed inside a node's graph, ▶ Run takes the canvas up to the top first, and what
is edited while it runs is handed over a moment after, so the next round runs that.

The App tab opens on what using the tool has left -- the values set on it, a conversation,
what the last rounds showed -- as a delivered tool does, and says why a round failed. What
a round the page starts still needs -- a file or a folder for a picker that sends to its
start point and has nothing chosen -- is asked for first, in *📥 Before running…*; so it is
on the Gui tab, whose blocks are live. Nothing else is asked when a round starts: a call
sends what it sends (`engine/src/host/session.test.ts`, "what a round asks before it
runs"). A delivered
tool starts the same way when it is opened, and has no ▶ Run of its own: its page is how
it is run, so a start point the page starts needs a block that fires it, and `check` says
so.

**A round explains itself.** Every snapshot of a round says what began it (`started`: the
start point and who sent it -- a block of the page by its id, a call, the graph itself --
or nothing, for a round of the whole graph), and every node that did not run says why: its
◆ stayed shut, nothing new reached it, what feeds it had nothing to do, or a node before it
failed, which it names (`execution/executor.test.ts`, "skips what depended on a failure";
`host/session.test.ts`, "what began a round"). The App tab says the last round in a line --
*Last round: "Send", from "Ask" -- 3 ran* -- with each reason under it, and each
node's card says its own. What the session keeps that the design does not say -- what each
start point was sent, what memory holds, what each block holds (`SessionView.kept`) -- is
folded under *What using it keeps* on the App tab, with **↺ Start over**, which forgets it
all; the delivered page has **↺ Start over** too.

After a run every node's card shows what it made, named by its port where it has several:
a line of text or a number, *214 rows* and the first row for a list of records, a small line
or bars for numbers or a chart's figure, a thumbnail for a picture — and a failed node the
first line of its error. An end point shows it under the input it arrived on.

The **App** tab is the page exactly as delivered, under the tool's own header: the graph's
name and description. It is the document that runs, so what it runs lights up the cards on
the Graph tab -- and what is set on it is the session's, never an edit of the document:
nothing to undo, nothing to save, and Deploy ships none of it. Its **⧉ Open as a tool** is
the same tool *detached*: the document is handed to the server and `runtime.html` opens in
a window of its own — the delivered page, the delivered entry point, the delivered routes,
with no editor around it at all, and the same session as the App tab, so a round started
there lights up the canvas too. Use the App tab while building, and the pop-out to see what
you are about to hand over. The window keeps the page it was opened with until it is opened
again.

**The clock.** A start point's time is kept by whatever runs the graph, with one clock
(`engine/src/execution/clock.ts`): one set to start when the tool starts starts first, each
one with an interval then keeps its own time, rounds never overlap, and a start point is
looked up again each time it is due -- deleted since, it starts no more. The **server**
holds that clock, in the session that holds the graph (`engine/src/host/session.ts`): it
runs with nobody watching, keeps what its rounds showed, and a page opened later shows that
and when the next round is due. A delivered tool's server starts it as it starts; in the
editor ▶ Run starts it, until ■ Stop -- and a tool opened with ⧉ Open as a tool is the same
session in a window of its own, so it shows the same clock rather than keeping one. A round
a start point starts by itself asks nobody anything: nobody is there when a served tool's
clock strikes. On the command line the shortest interval applies without a flag, and
`--every` overrides it; each round is the one the command asks for -- the whole graph, or
the round `--event` names. A clock inside a [subgraph](#subgraph-nodes) never ticks, and
`check` says so: only the outermost graph is held by something that keeps time. A start
point that starts itself, but neither when the tool starts nor on a clock, never starts,
and one whose interval nobody can read keeps no time; `check` names both
(`StartNodeRunner.test.ts`, "says when it starts itself and never would, or names a clock
nobody can read").

### Calling a graph

A graph is called by its names, never by its nodes and ports. What it offers --
`GET /api/runtime/interface`, the MCP server's `describe_graph` -- is each start point, with
who starts it, the blocks that fire it and what the page sends with it, and what the graph
*reads* of what it is sent: each part an input wired from it takes, by its field, typed as
it takes it; and each end point (`interfaceOf`; `graphInterface.test.ts`, "what a graph
offers"). A round is started by a start point's name, with values:
`node engine/src/main.ts my_tool --event measure --value paragraph=…` (each `--value` a
text under a name), `run_graph` with `event` and `values`, `POST /api/runtime/rounds`. The
values go into that start point's package as they come. A round of the whole graph is sent nothing, and values for it are refused before
anything runs (`checkSent`; `graphInterface.test.ts`, "is nothing, for a round of the whole
graph"). The routes, the session and the stream are in
[connection-points.md](connection-points.md#the-runtime-api).

---

## Code and AI Nodes

A code node and an AI node are built the same way: **you say what it should do, and ✨
writes the rest** -- a file each, every one of them yours to read and change:

```
input.js     what one call is handed: a JSDoc typedef, then one example of it as plain JSON
output.js    what one call returns, the same way -- its keys are the node's outputs
code.js      a code node's body: function run(inputs), returning an object keyed by output
prompt.md    an AI node's instructions to its model
history.md   every exchange with the model about this node, oldest first
```

A definition is JavaScript, so it reads as code and opens with types in an editor; its
example is plain JSON after `module.exports =`, so the engine reads it without running
anything:

```js
/**
 * @typedef {Object} Input
 * @property {string} csv  the chosen CSV file's text: a header row, then one row per name
 */
module.exports = {
  "csv": "Country,Population\nChina,1419\nIndia,1450"
};
```

**The node's panel** is the order the work is done in, the same for both kinds:

```
CODE  code                  its kind and its id, atop the panel as on its card
Code 1                      its heading -- never empty: a new node is its kind and a number,
                            and while nobody changed that, it is written from the text
What should it do?          a sentence or two, in your words
✨ Input                    the prompt it is written with; input.js ↗ and its content, in a
                            box; the files it is written from -- examples, a spec:
                            ⟳ From the graph, 📂 Add a file…, or dropped here
✨ Output                   the prompt; output.js ↗ and its content; the files it may be given
✨ Code                     the prompt; code.js ↗ and its content (an AI node: ✨ Prompt,
                            prompt.md)
▶ Try                       one call on input.js's example, held to output.js
history.md ↗
Advanced                    its ports, once per item, failures, items at once -- an AI node's
                            model, temperature, tools and pictures too -- and what runs it
```

Each file is in sight in its row, written or not: its content in a box, edited there as
in the file -- a few lines high until it holds more, its stub while it is empty -- and a
chip beside it that opens it in your own editor (the project is saved first, and what you
save there comes back by itself; greyed, while the graph is not saved as a project).
**One press does the
whole node:** the body's ✨ writes what is missing of input.js and output.js first, and
stops at a definition that does not fit the node -- an example that names an input the
node does not have, or leaves out an output wired on -- since what came after would be
written against it. While it writes, what it sends shows as it goes, and **Stop** beside it
ends the wait: what was written stays, what was still on its way is not written (a model
call is given up by itself after ten minutes). There is no Save and no Cancel: a change is
in the graph a moment after it is made, one undo step per field typed into, and what ✨
writes is a step of its own. The toolbar's **✨ Generate** writes every empty node in the
order the graph runs, each against what the one before it turned out to return.

**A new node runs once**, on what arrives -- a list whole -- and hands on one value.
**Run once per item**, under Advanced, is asked once a list arrives (down a wire, or in
input.js's example): ticked, each item is a call of its own and each output hands on the
list of what the calls gave, as many at once as *Items at once* says (four by default).

**The prompts.** Each ✨ is sent a prompt, in sight under its button: the standard one
until you change it (Reset takes it back; the node keeps only the prompts that differ, in
`config.prompts`). **What ✨ sends** shows it filled in, word for word, without sending it.
A prompt names what the node and the graph hold by variables, filled in by their exact
names -- anything else in braces is sent as written (`engine/src/host/editor/brief.ts`):

| Variable | Filled with |
|---|---|
| `{Node Description}` | `# <heading> (ID <id>, <kind> node)`, then its text |
| `{Input Definition}` | input.js as it is, where it is written -- and after it, always, each input as wired: its type, where it comes from and what arrives there (a data node: the start of what it holds; a start point: what the blocks of the page that send to it send, or what a call sends it, for example -- the part the input takes) |
| `{Output Definition}` | output.js as it is, where it is written -- and after it, always, each output as wired: where it goes and what the node there wants (an end point: what the result is for and where it goes, and what the block that shows it wants -- a chart its points or a figure `{kind, title, points}` -- at the size it is drawn) |
| `{Context}` | the graph around the node: its name and text, its nodes in the order they run, the wires, and the page -- its colour scheme, and each block as a person calls it ("a file picker block"), its size and the start and end points it connects to -- about 3 000 characters at most |
| `{Example Files}` | for ✨ Input: the files it is given, each path and the start of it -- about 4 000 characters between them |
| `{Output Files}` | for ✨ Output: the files it is given, the same way |

After the prompt the engine adds a frame of its own, which is not yours to edit: the
file's format -- for a definition, its two lines with the keys in double quotes,
`module.exports = { "input": … };`, and plain JSON after them -- how to answer, the keys
the code must return, that output.js names one output for each thing the text asks the
node to hand on ("its mood, and the reason" are two) -- and that a missing or empty
input is answered with what to do rather than a failure (a chart gets a figure with no
points and a title saying what to choose).

**▶ Try** runs this one node once, on the example in its input.js, as a run calls it --
a model asked where it asks one -- and holds what comes out to output.js: **✓ fits
output.js**, or where it does not -- each output named once: *output "output" is a number;
output.js says a list*. An output.js that cannot be read fits nothing: ▶ Try, `test` and
✨ Code say *output.js cannot be read* and why. **✨ Fix** repairs the body from that --
and an output.js that cannot be read, which comes back corrected -- and says what the repair
came to (*✨ Fix: repaired*, or *still does not fit*). ✨ Code does the
same by itself: what it writes is tried on the example, and sent back once to be repaired
when it fails or does not fit. To change what a node does, say so in the bar under the
canvas: its body is changed as said, with what the last try showed, and its text restated
to match. Where the change needs other outputs than output.js describes -- a figure where
it returned a table -- the new output.js comes back with the body and is written with it;
without one, the changed body is kept and what does not fit the old output.js is said
(✨ Output then writes output.js from the restated text), never "repaired" back.

**An AI node at run time** sends its prompt.md -- or, while that says nothing of its own,
the standard instructions -- with `{Node Description}` and `{Output Definition}` filled in,
and after it everything wired in: one input as it is, several each under its port id. A
list becomes paragraphs, not `["…","…"]`. **Nothing wired in is ever dropped**, and a node
nobody has written anything for still works: its text is the question. The answer is plain
text: on `output` without an output.js, on its one output where output.js names one that
holds text. Only where output.js names several outputs, or a value that is not text, is the
model asked for JSON keyed as its example is -- taken from the first fenced block, else from
the outermost `{…}` of the answer -- and each key goes out on the output of that name.
Everything else -- model, temperature, tools,
pictures, batching, failures -- has a default that is right for most nodes and sits folded
under **Advanced**; which model a node calls is the one setting in ⚙ Settings unless the
node is pinned to its own. For tools, see
[ai-providers.md](ai-providers.md#tools-connecting-a-prompt-to-an-mcp-server).

**A code node** is a JavaScript `run(inputs)` returning an object, run on the Node that
runs the engine -- which is why a bundle needs nothing installed:

```js
function run(inputs) {
  const text = String(inputs.text ?? '');
  return { word_count: text.split(/\s+/).filter(Boolean).length, upper: text.toUpperCase() };
}
```

`node nodes/count/code.js` runs it by itself on input.js's example and prints what comes
out: the folder writes lines after the body that do that, and takes them off again when it
reads the file, so neither the engine nor ✨ ever sees them. They run input.js apart, in a
context of their own (`node:vm`), so they work as an ES module too -- a body that uses
`import`, a folder under a package.json that says `"type": "module"`.

**It may ask a model.** `run` may be `async` and is handed a second argument, `node`:
`await node.llm({ prompt: '…' })` resolves to the answer as text, from the model in
⚙ Settings (see [ai-providers.md](ai-providers.md)); `system`, `temperature`, `provider`
and `model` may be given with it. The body runs sandboxed and never sees this machine's
keys — the call is made *for* it — and may ask at most 25 times each time it runs -- per
item, for a node that runs once per item -- (`AI_GRAPH_MAX_LLM_CALLS` raises it). Use it
when code has to decide what to ask, or ask in a loop; for one question, an AI node is the
plainer tool. How the body is run is in
[connection-points.md](connection-points.md#the-body-protocol).

### A project is a folder

Save a graph under a name — `my_tool` — and it becomes a folder. (A new graph's Save
opens the file browser in the folder the last graph was opened from or saved to -- at
first the folder the server was started in -- with its name filled in.) The flow is one
file, the page is a folder beside the nodes, and each node is a folder that says
everything about that node:

```
my_tool/
  flow.json               the graph's name, which nodes there are, and every wire
  layout.json             where each node sits on the canvas
  page/                   the page: what whoever uses the tool sees
    page.json             its blocks, in order -- each one's kind, label, size, value and
                          the start and end points it connects to
  nodes/
    draw/                 one folder per node, named by its id
      node.json           its heading, its text and its settings
      interface.json      what goes in and what comes out
    count/
      node.json
      interface.json
      input.js            what one call is handed, and an example
      output.js           what one call returns, and an example
      code.js             the code
      history.md          every exchange with the model about it
    summarize/
      node.json
      interface.json
      input.js
      output.js
      prompt.md           the instructions sent to the model
  frontend/               optional: a page of your own, served in place of the built one
  tests/                  optional: rounds kept as tests -- measure-1.json, …
```

(`state.json` beside `flow.json` is what using the tool left behind: not part of the
project, never saved or shipped with it.)

**A round kept as a test** is a file in `tests/` ([`project/keptRounds.ts`](../engine/src/project/keptRounds.ts)),
kept from the App tab (**Keep as a test**) or the command line (`--event <name> --keep`) after
a round that ran through: `event` (the start point it began at, `null` for a round of the
whole graph), `by`, `given` -- what its nodes made that came from outside the graph or from
before, by node id: its start points' packages, what its models answered, what its memory
held, what stood still -- and `outputs`, what its end points handed back. `test` and
`test_graph` run it again: what is in `given` is handed in instead of run, everything else
runs, and the end points must hand back what they did, or the details say what differs. No
model is asked; a node that would be, because the graph changed since, fails the round
(`project/keptRounds.test.ts`). [examples/nested_statistics](../examples/nested_statistics/)
keeps one, which CI runs with every `test --offline`.

**Each fact is in one place.** `flow.json` says which node feeds which, and nothing about
any node -- and nothing about the page, which is no node. This is
[examples/population_plotter](../examples/population_plotter/)'s:

```json
{
  "name": "Population plotter",
  "description": "Choose a CSV of names and numbers and see it as a chart. …",
  "nodes": {
    "draw": "start",
    "chart": "code",
    "plot": "end"
  },
  "wires": [
    "draw.data -> chart.csv",
    "chart.figure -> plot.value"
  ]
}
```

Beside the name it carries the graph's `description` and any other graph setting that is
not at its default, such as `gui_scheme`. A node's folder says everything about that node,
and nothing about its neighbours. A node that needs to know what arrives follows the wire
and reads the other node's output.js — which is what `check` does when it holds a wire to
what the node before it hands on, and what ✨ is told. `interface.json` lists a node's
ports; the chart node's:

```json
{
  "inputs": [
    { "port": "csv", "name": "CSV", "type": "text", "field": "file.content", "description": "The CSV the page sends: the chosen file's content" }
  ],
  "outputs": [
    { "port": "figure", "name": "Figure", "type": "json" }
  ]
}
```

`port` and `type` are always there; `name` (when it is not the id), `list: true`,
`required: true`, `description` and `field` only where they say something
(`engine/src/project/interfaceFile.ts`). `page/page.json` is the page's blocks, in order,
each with its settings and what it connects to by name -- the same plot's:

```json
[
  { "extensions": ".csv", "fires": "draw", "h": 2, "id": "file", "kind": "input_picker", "label": "CSV file",
    "mode": "file", "sends_to": ["draw"], "tone": "sunken", "value": "examples/data/population.csv", "w": 16 },
  { "h": 9, "id": "plot", "kind": "plot_window", "label": "", "shows": "plot", "tone": "plain", "w": 16 }
]
```

| Node | Files | Setting kept in each |
|---|---|---|
| Every node | `node.json` — its heading, its text and its settings. `interface.json` — its ports: id, type, whether a list, whether required, and the part of a package an input takes | `label`, `description`, `config` |
| Code | `input.js`, `output.js`, `code.js`, `history.md` | `input_definition`, `output_definition`, `code`, `history` |
| AI | `input.js`, `output.js`, `prompt.md`, `history.md` | `input_definition`, `output_definition`, `prompt`, `history` |
| Data | `data.json` or `data.txt` — what it holds — and `history.md` | `data_value`, `history` |
| Subgraph | `flow.json`, `layout.json`, `nodes/` — the graph it holds, a project folder of its own ([On disk](#on-disk)) | `subgraph` |
| The page | not a node: `page/page.json`, beside `nodes/` — its blocks, in order | the graph's `page.blocks` |

**The folder has every file from the start.** A file nothing has been written into yet is
its stub: a comment saying what the file is and which ✨ writes it -- a definition's stub
ends `module.exports = null;`, read as no example at all, and code.js's `node code.js`
says "code.js holds no code yet: write it with ✨ Code." and exits with 1 -- so the folder
shows what the node is made of before any of it exists. `history.md` comes once there is
history. A start point, a folder node and an end point keep no writing: all they are is
settings. The page is its blocks, so they are a file of their own, and a tool's page is the
one folder anybody opening the project looks for; a page of no blocks is no page, and has
no folder (`engine/src/project/folder.test.ts`, "keeps the page beside the nodes, in page/,
as its blocks alone: no node, and nothing flow.json names"). Settings — the model, the
temperature, who starts a start point — are in a node's `node.json`, and positions in
`layout.json`, so moving a node on the canvas is not a change to what the graph does, and
an unchanged save changes no file. Renaming a node renames nothing on disk: folders are
named by id. A new node's id is its type — `code`, then `code_2`; `start`, `start_2` — an
end point made for a block is named after the block, and a new block's id is its kind —
`input_picker`, `text_io_2` — so the files read as what they join: `draw.data -> chart.csv`
in `flow.json`, `"sends_to": ["draw"]` in `page.json`. An id a folder could not read back --
one with a `.` or `->` in it, a number, or two that differ only in case -- is a problem
`check` names, and a save refuses it.

The files are what runs. `node engine/src/main.ts my_tool` runs the folder, a served
tool reads it, the MCP server reads and writes it; `git diff` shows code as code. A
deploy bundle carries the project as this same folder
([deployment.md](deployment.md#what-a-bundle-carries)).

**Editing outside.** Open any of these files in your own editor (or let git change
them): the editor watches the folder and takes what changed in as one undo step, with
*↻ From disk: …* in the header. A node open in its panel shows the new version at once,
with what was typed there in the last moment and not written yet kept on top. Saving
refuses to overwrite a file changed outside since it was read, and **Save as…** onto a
project or a graph file that is there already asks before it replaces it. **File ▸ Reload from disk**
reopens the whole project, for when `flow.json` or a node's settings or ports changed
(a pull, a merge).

**A single `.json` file** opens, saves (name it `….json`) and runs: everything
inline, as in [the graph document](#the-graph-document). A folder is a project only when
it has a `flow.json`; a text that has a file there is read from the file, not from the
inline value.

**What goes out is what output.js says.** A code or AI node's outputs are the keys of its
output.js example, and each run is held to it: a result that does not fit is said on
it -- *Does not fit its output.js: output "rows" at [3].Population is text; output.js says
a number* -- rather than by the node three steps later, failing on the wrong shape. The
nodes after it are written against it: it is what ✨ tells them it hands on.

**Without the editor.** Every file in a node's folder is plain text named for what it is,
so a node can be read, changed and run with nothing but the engine.
`node engine/src/main.ts test my_tool` runs each code and AI node once on the example in
its input.js and holds what comes out to its output.js -- one that takes something in and
has no input.js yet is listed as skipped; `--node <id>` tries one node; `--offline` asks no
model and skips what needs one, which is how CI runs this repository's examples
(`.github/workflows/ci.yml`).
`node engine/src/main.ts run-node my_tool count` runs one node by itself on its input.js --
or on inputs given as JSON (`run-node my_tool count '{"csv": "data/rows.csv"}'`) -- and
prints what came out. A node of another kind runs on what the nodes feeding it produce: a
start point hands on what it was sent, its design's.

**Checking a project.** `node engine/src/main.ts check my_tool other_tool` says what is
wrong without running anything: a node of a type there is none of, a node without a
heading, a code, AI or data node without a text, edges to ports that do not exist, ids a
folder could not read back, a circle no data node closes, a code node without code, a
folder under `nodes/` that belongs to no node, a file there or in `page/` that nothing
reads, and definitions that do not fit -- an example that cannot be read, one that names an
input or output the node does not have, an output.js that leaves an output out, and a wire
into a port that the node wired into it does not supply according to its output.js. That
last one is where a need meets a supply: either the node asks for the wrong thing, or the
node before it has to deliver it. It also finds a graph nobody can see the result of (no
end point), two end points with one label, everything the page gets wrong ([below](#the-page)),
a start point that never starts or names an interval nobody can read, *once per item* set
where a list arrives and no input is declared one, a wire into a ◆ that can never carry
`true`, and what is wrong inside the graph a node holds, said with the way down to it --
graphs nested more than five deep among it. It exits with 1 when it finds anything, so a
CI job fails on a broken graph; this repository checks its examples that way
(`.github/workflows/ci.yml`; `engine/src/project/check.test.ts`).

### What runs, and where

Every node's panel says what runs it -- *What this node runs* at the end of Advanced for a
code or AI node, a folded *What runs, technically* for the others. There are two answers:

- **A body in the node's folder** — JavaScript somebody wrote, or a model did. Always the
  same shape, `async function run(inputs, node)`, returning an object keyed by output port;
  always in a sandboxed process of its own; always able to ask a model through
  `await node.llm(...)` without ever seeing a key.
- **The engine**, for the kinds whose work is the engine's own. The line names the class
  and method, so the code is one click away.

| Node | What runs | In one sentence |
|---|---|---|
| Start point | `StartNodeRunner.execute` | Hands on one package: the event, when this round began here, and the values it was sent -- the last ones, in a round it did not begin. |
| Folder | `FolderNodeRunner.execute` | Lists the folder whose path arrives on "path" (or the one it names) -- its file types, and its subfolders when it looks into them -- and hands on the files as "files". |
| AI | `AiNodeRunner.execute` | Sends prompt.md -- or the standard instructions, while it says nothing of its own -- with its description and output.js filled in, then what arrived, each input under its port id where there are several. The answer is text on its one output; where output.js names several outputs or a value that is not text, it is parsed as JSON and each key handed on its output port. |
| Code | `code.js`, sandboxed | Calls run(inputs, node) in code.js, sandboxed, and hands on the object it returns, keyed by output port. |
| Data | `DataNodeRunner.execute` | Hands on what arrives this round, or else what it kept; what arrives is kept for the next round. |
| End point | `EndNodeRunner.execute` | Hands on what arrives: the run's result, under its label, to whoever ran the graph. Writing to a file: writes what arrives to its file and hands it on, with "written_path"; to a folder: writes each value that arrives -- each item of a list -- to a file of its own in its folder, and hands it on, with "written_paths". |
| Subgraph | `SubgraphNodeRunner.execute` | Runs the graph in its folder, whole, with what arrives on each port sent to the start point of that name, and hands on what reaches its end points. |

The sentences are the elements' own (`whatRuns`), the ones each panel shows;
`engine/src/elements/times.test.ts` ("what runs") holds that every kind says one, and that
the file or the method it names is there.

### A file, dropped or picked

A file dropped on a code or AI node on the canvas -- or on the files line under its
✨ Input -- is one more file ✨ Input writes its input.js from. **📂 Add a file…** picks
one, and **⟳ From the graph** takes the one the graph hands the node: what the last run
brought a file-reading input, or else the file its start point is sent -- the file a picker
that sends there starts on, or a path in what a call sends it, for example -- or else what
the nodes that feed it deliver when they are run now (`editor/src/authoring/exampleFile.ts`).
Dropped on a data node, a file is what the node holds, parsed when it is JSON. A path is
kept relative to the folder the editor runs in. A browser never says where a dropped file
is; the editor finds the one file of that name and size in its folder and three levels of
folders below it (not in `node_modules`, `dist`, `build` or a name beginning with a dot),
and says so, and where it looked, when there is none or several.

### The editors

The box a file is shown in is a real editor (CodeMirror): syntax colours, line numbers,
folding, bracket matching, search with Ctrl+F, undo and redo of its own (Ctrl+Z,
Ctrl+Shift+Z or Ctrl+Y). In the panel Tab moves on to the next field and Esc leaves the
panel open; **⤢** opens the same document across the whole window, where Tab indents, and
Esc comes back.

For longer work there is your own editor: a file's chip in the node's panel opens it in
VS Code when its `code` command is installed, otherwise in a text editor, never run. Only a
project's own files under `nodes/` can be opened this way, and only from the machine the
editor runs on.

**Packages.** A code node runs against Node's standard library and nothing else. There is
no install step and nothing is fetched while a graph runs, which is what keeps a bundle
runnable on a machine that was handed nothing but the bundle.

---

## Subgraph Nodes

A `subgraph` node holds a graph. Outside it is one box with ports and a sentence saying
what it is for; inside it is an ordinary graph on an ordinary canvas.

**It really is an ordinary graph**, and everything follows from that. The same engine
runs it, the same `check` checks it, the same editor edits it — and because its folder is
a project folder like any other, it can be opened, checked and run on its own:

```bash
node engine/src/main.ts examples/nested_statistics/                      # the whole thing
node engine/src/main.ts examples/nested_statistics/nodes/statistics/     # just the part
```

Graphs may hold graphs five deep (`NESTING_LIMIT` in `engine/src/execution/executor.ts`);
`check` names a deeper one.

### Its ports are the graph inside it

| Outside | Inside |
|---|---|
| an input port | a start point, unless it starts itself: nobody above can start that one |
| an output port | an end point, carrying one value |
| the port's name | that node's label |
| the port's id | that node's id |

There is no separate port list to keep in step: add a start point in there and the node
out here grows an input. Renaming changes what a port is *called* and never which edges
lead to it, because the port's id is the inner node's id. Every port is typed `any`; an
output port is a list when the value its end point carries is one
(`engine/src/elements/nodes/subgraph/boundary.ts`; `SubgraphNodeRunner.test.ts`, "has only
its start points and end points for ports: there is one kind of way in and out").

What arrives on a port is sent to the start point of that name, under that name. In
[examples/nested_statistics](../examples/nested_statistics/) a call starts `measure` with a
`paragraph`; the node `statistics` takes `paragraph` of that package on its port `text`,
and the start point `text` inside hands on

```json
{ "event": { "name": "text", "by": "graph" }, "values": { "text": "<the paragraph>" } }
```

of which the code node in there takes `text` (`SubgraphNodeRunner.test.ts`, "sends what
arrived on a port to the start point of that name, under its name, as the graph above"). The graph inside runs whole, every start point
in there counted as having begun the round, and a port nothing is wired to leaves its start
point handing on what its design says it was sent -- which is also what lets the graph
inside run on its own. A start point added inside a node's graph in the editor is started
by a call, and what a call sends it is `{"<its id>": ""}` for example, so an input wired
from it takes that one part without a word (`placedInside`,
`editor/src/document/nodeKinds.ts`). An example keyed otherwise -- its heading
renamed "Text", the example `{"text": …}` -- is what a run of it on its own is sent, and
the graph above sends none of it: `check` and the start point's panel say so
(`SubgraphNodeRunner.test.ts`, "is told that a start point in there whose example is keyed
otherwise than it is sent from up here hands on nothing").

A folder node in there is a node that lists, not a port. To say from outside which folder
it lists, wire a start point in there into its `path`, taking the part the graph above
sends it -- the start point's own name -- exactly as one graph's nodes take a part of a
package anywhere.

### On disk

The graph a node holds is a project folder of its own, under that node's folder:

```
nested_statistics/
  flow.json                measure (a start point) -> statistics (a subgraph) -> report (an end point)
  layout.json
  frontend/index.html      a page of its own, which knows the graph only by its names
  nodes/
    measure/               node.json, interface.json
    report/                node.json, interface.json
    statistics/
      node.json            the node's own settings, and what this part is for
      interface.json       its ports: the start points and end points of the graph inside
      flow.json            the graph it holds
      layout.json
      nodes/
        text/              the start point its port "text" is sent to
        counts/code.js     a node of that graph, with its files as usual
        counts/input.js
        numbers/           the end point that is its port "numbers"
```

`check` descends into it and says where it was
(`node "statistics" ▸ edge "text.data -> counts.text"`), `test` tries the nodes in there on
their input.js, and a bundle carries the whole depth: a model called from inside is a model
the recipient is told to configure.

### In the editor

**Open this graph ▸** in the node's panel goes in; the breadcrumb in the header comes
back out, one click per level. Each level has its own undo. Save and Deploy are about the
whole document from any depth, and so is ▶ Run: it runs the application, and takes you
back up to the top first. The panel lists the node's ports -- the start points and end
points in there -- and has them edited where they are: in there.

A subgraph may be nothing but its sentence to begin with: an empty one with a description
is how a plan is drawn before it is built, and `check` lists it as something still to do.

### When something in there goes wrong

Anything short of a clean run inside fails the node that holds it, with the reason and the
name of the inner node it came from. That includes a run that only half worked — an item
of a fan-out that failed, or a node in there that caught its own failure and passed
nothing on. From outside this is *one* node, and half of it having worked is not something
a port can carry: what it would carry is a null nobody can explain.

To let the graph above carry on regardless, tick **Catch a failed run instead of ending this one** on the
subgraph node itself. The reason then arrives on its `error` port, which is where a caught failure
belongs, and everything wired to that port gets to react.

### Rules at the boundary

**Events.** From outside, the node has a ◆ like any other. Inside, every start point
counts as having begun the round, so a start point in there wired into a ◆ opens it
whenever the graph above runs the part (`SubgraphNodeRunner.test.ts`, "starts a start
point in there that is wired into a ◆: the graph above sending to it opens the node"). For
a node in there that runs only sometimes, hand a boolean down a port and let a code node in
there return it onto that node's ◆: `true` opens it, anything else leaves it shut. A start
point in there that the page starts is reported, since a page belongs to the graph at the
top and nothing would start it; so is one on a clock, because nothing in there keeps time.

A page belongs to the graph at the top, so a page inside is reported as a mistake: it
would never be shown. A list crosses a port as one value: the graph inside runs once, on
all of it -- or, with **Run once per item** ticked in the node's panel (it is asked when a
list arrives), once for each item, and each output hands on the list of what the runs gave,
as a code node's does. Names at the boundary may not collide: two start points or end
points with one label are two ports of one name, and an end point in there carries one
value (`engine/src/project/check.test.ts`: "refuses two ports of one name, and an end point
carrying more than one value"). The events rules are held by `SubgraphNodeRunner.test.ts`,
"events and a graph inside a node".

### What it does not do yet

A data node in there does not keep its value between runs of the graph above: each run of
the part starts from what its design holds.

---

## The page

A graph has **one page**: an ordered list of **blocks** -- in the file
`"page": { "blocks": [...] }` beside the nodes and the edges, in a project folder
`page/page.json`, an array of blocks. It is no node: nothing is wired to it, and it is in
neither the graph's order nor its rounds. A block connects itself to the graph by name
(`engine/src/elements/page.ts`):

- `sends_to` -- the start points its data goes to: it is in the package of each, under the
  block's id;
- `fires` -- the start point using it starts;
- `shows` -- the end point whose value it shows.

Which of the three a block can do is its kind's answer (`WidgetRunner`: `sends`, `event`,
`showsEnd`; `engine/src/elements/connections.test.ts`), and the Gui tab offers it nothing
else:

| Block kind | Sends (`sends_to`) | Fires (`fires`) | Shows (`shows`) |
|---|---|---|---|
| `input_picker`, mode `file` | the chosen file, `{path, content}` -- read as a node reading it is handed it; with `send: "path"` only the path | when a file is picked | — |
| `input_picker`, mode `directory` | the paths of the folder's files of the types in `extensions` -- its subfolders' too with `recursive` | when a folder is picked | — |
| `text_io` | mode `input`, or `both` (what a block without a mode is): the text typed | on Enter | mode `output` or `both`: what arrives -- a list a line per item, a record a line per key, `words: 32` |
| `select` | the choice: one of its `options`, one per line | on a choice made | — |
| `slider` | the number, inside `min`, `max` and `step` | when it is let go | — |
| `button` | nothing | when it is pressed | — |
| `chat` | `{message, history}`: what was just said, and everything before it | when a message is sent | the reply, which joins the conversation |
| `plot_window`, `table`, `image_view` | — | — | what arrives: each draws it, and runs no code of its own -- a list in a table's cell as its items, `a, b` |
| `text` (heading, body, caption), `divider`, `spacer` | — | — | — : they are the page's design |

It is made on the **Gui** tab by its first block, not dropped from the palette, and goes
with its last: a page is its blocks, and a tool whose page has none shows what it does and
its end points' values under their labels, as a tool without a page does. The page has no
name of its own: the tool is called what the graph is, and the graph's name and
description are edited above the page and shown in the delivered tool's header. Its colour
scheme is chosen on the Gui tab (*Colour scheme of the page*).

**On the Gui tab** a block's settings say how it connects: *Its data goes to* (the start
points the page starts, and *+ New start point*), *Using it fires* (Nothing, a start point,
or *+ New start point*) and *It shows* (Nothing, an end point, or *+ New end point*). A new
block comes connected as it is most often wanted, in one undo step with what that takes:
what it sends goes to the page's start point -- the one there is, or one made for it,
`start`; where the page starts several, which one is the person's to say. A button or a
chat fires it too, whatever else does; any other block that can fire -- a picker, a
dropdown, a box, a slider -- fires it while nothing on the page fires it yet, so a picker
alone on a page runs the graph when a file is picked. A block that shows gets an end point
no block shows yet, or one made for it (`editor/src/page/pageWrite.ts`; `pageWrite.test.ts`,
"a block put on the page"). Relabelled, a block takes the end point it shows along while
that is still called after it -- labels only, never ids ("relabelled, takes the end point it
shows along"). An end point's label is the name the run's result, a script and `run_graph` read it
by, so that name changes with it.
Deleting a start or end point takes the page's connections to it along, in the same undo
step; removing a block leaves the points it named, which are the graph's.

**What is wrong with a page is named** by `check` (`pageProblems`;
`engine/src/elements/page.test.ts`, "what is wrong with a page"): a block connected to nothing; a start or end point the graph lacks; a
connection the block cannot make -- a button that shows, a heading that sends --; a block
that sends to or fires a start point the page does not start; a start point the page starts
that nothing on the page fires; an input that takes a part of what such a start point is
sent that no block sends it; a block without an id, or with another block's; and a block
whose id is what a package says when no block sent it. Of a start point a call starts,
which holds what it is sent for example, `check` names an input taking a part that example
does not hold: run on its own, it is handed nothing there (`project/check.test.ts`, "what
check finds of what a call sends a start point").

A block's `id` is the name its data is sent under -- `file.content` is the content of what
the block `file` sends -- so it stays as it was given. A new block's id is its kind, and its
label is what it is, each numbered beside another of that name ("Text output 2"), as nodes
are. A block that cannot say what it holds -- a folder picker whose folder is gone -- fails
the round before it starts, naming the block (the same file, "fails the round, by the
block's name, when a block cannot say what it holds"); an image that cannot be read says so
in its place.

Every block has a *tone* (plain, raised, sunken, accent) drawn from the page's scheme,
and on top of that its own frame toggle and background colour — set in the block's
editor; "Default" hands the choice back to the tone. A text box that shows text, a chart and a table show
a **⤓ Save** when the pointer is on them: the text as `.txt`, the chart as `.svg`, the rows
as `.csv`.

### A chatbot is a block and a model

The `chat` block keeps its own conversation. It sends `{message, history}` to a start
point, fires it as a message is sent, and shows an end point: wire the start point's `data`
into an AI node's `message` and `history` -- one taking `chat.message`, the other
`chat.history` -- and the AI node's answer into the end point, and that is a chatbot. Sending a message
starts the graph at the AI node, the answer closes the turn, and the turn goes out again as
history with the next message. The turn is written down only when the answer arrives: a
call that fails leaves the conversation as it was, with the message back in the box to send
again. See [examples/chat](../examples/chat/) -- one block, one start point, one AI node, one
end point: its AI node is sent the history and the message each under its port id, after
its prompt.md (`engine/src/host/session.test.ts`, "a chatbot is a page and a model").

### Picking files and folders

Every path field — the picker block, the *📥 Before running…* window, a folder node's
folder and an end point's file — has a **📂 Browse…** button that opens a file chooser. It
browses the machine the graph runs on, not the one the browser is on, because that is where
the engine opens files; a native browser file dialog cannot be used here, since browsers
reveal only a file's name and never its location. Deployed tools get the same picker, but
only when bound to localhost (the default): started with `--host 0.0.0.0` the browse
endpoint is switched off rather than exposing the host's filesystem listing to the network
(`engine/src/host/serve.ts`).

**A folder is a listing**, the same for a folder node and a folder picker: the folder, its
file types (`extensions`, e.g. `.csv, .txt` — compared without regard to case) and whether
it looks into subfolders (`recursive`). It hands on every file it lists, sorted; its panel
shows that list when asked, made the way a run makes it (`engine/src/elements/folderListing.ts`).
To use only some of the files, wire a code node after it that returns the ones to keep.

### Building the page

A block holds a value: what was typed, chosen or picked, and a round of a start point it
sends to reads it. On the **Gui** tab a value set on a block is part of the design -- what
the page starts with, in `page.json`, saved with the project. On the **App** tab, and in a
delivered tool, it is the session's: it survives the round, and a restart of a served tool
(`state.json`), and is never an edit of the document ([State](architecture.md#state)). A
conversation is always the session's.

The page is built on the **Gui** tab, and it is built like a document rather than laid
out like a canvas:

- **Words are typed where they stand.** Click a heading or a paragraph and type.
- **`/` inserts.** Press `/`, type what you want — *button*, *chart*, *title* — and Enter.
  The palette on the left is the same list, for finding out what exists.
- **Size is a fraction of the page.** The selected block carries a small toolbar:
  ¼ ½ ¾ Full, shorter/taller, move up/down, add a block below, remove. Two halves sit
  side by side; the corner can still be dragged to any size.
- The panel on the right shows what the selected block *is* — its label, how it connects,
  and its own settings (for a chart, a table or an image: one sentence of what it shows).
  How it looks and its exact size are folded away under *Look & size*.

A block that **fires** a start point is marked `⚡` on the page being built, and its start
point's card on the graph canvas names it; the start point's `data` port is the amber
diamond the ◆ wears — the same shape wherever a round begins. A block that only sends is a
value: in the package whenever its start point fires, and starting nothing by itself.

Blocks are live while you build — a button pressed here runs the graph, a chat sends —
and the **App** tab, while ▶ Run runs the application, is the delivered page itself. `w`
and `h` are presentation only: nothing a round does reads them.

A block on a page writes nothing: it has settings, and sends or shows what it holds. A
chart, a table or an image shows what arrives at its end point, and its dialog says in one
sentence what that should be; whatever has to be shaped into it first is a code node wired
in before the end point.

### A chart draws itself

**A node says what to plot; the chart draws it.** That line is the whole design, and it
is not a preference: a node runs when the *graph* runs, and a window changes size when
someone *drags* it. The two moments have nothing to do with each other, so a node cannot
know how big the chart it feeds will be. Send it a **figure** — ordinary data — and the
block lays it out at the size it really is, in the colours of the page:

```json
{ "kind": "bars" | "columns" | "line" | "donut", "title": "…",
  "points": [{ "label": "India", "value": 1450000000 }] }
```

A bare list of numbers or of `{label, value}` is the same thing with the two decisions
left out. Axes, gridlines, category and value labels, a legend and the total are drawn
for you -- with more bars than names have room for, every second or third is named, never
none -- and because `kind` is a *value* like any other, a dropdown on the page can choose
it: the node that writes the figure takes the choice from its start point's package and
puts it in. `bars` are horizontal and are the right choice when the categories are names,
since a name reads along its bar instead of being cropped under a column. A value may be a number written as text
(`"1450"`, as a CSV cell arrives when nothing parsed it). A figure with no points shows
its title where the chart will be: what a node says before there is anything to plot. See
[examples/population_plotter](../examples/population_plotter/), where the code node
parses a CSV and writes no SVG at all -- and, with no file chosen, hands on a figure
titled "Choose a CSV file to plot.".

A figure is laid out for the pixels the block actually has, so a resize redraws it with
**no run at all**, and a change of the page's colour scheme recolours it. There is no
inner coordinate space anywhere: a drawing built for a guessed 720×340 and stretched into
a block measured at 1084×470 puts its 11px labels on screen at 15px and wastes the
difference as letterbox.

For anything those four shapes cannot do — a scatter, several series — a node upstream
can hand the chart a finished **SVG** document, a string starting with `<svg`, and the
chart shows it as it stands. It is shown as a picture, which runs no script and fetches
nothing, so it carries its own colours and sizes itself: give it a `viewBox` and
`width="100%" height="100%"` so it scales to the block
(`editor/src/elements/widgets/plot_window/PlotChart.test.ts`: "is shown as a picture, never
as markup in the page").

A chart has no code of its own, and neither has any other block: what shapes rows into
points is a code node wired in before its end point. What arrives that a chart cannot draw
— rows whose number is not called `value`, a record — it shows, with what it takes, rather
than waiting for data that came. A **table** shows rows — a list of objects,
whose keys become its columns, or a list of lists whose first row is the header. An
**image** shows a file path, an http(s) URL or a data URL, or a list of them as a contact
sheet: a run reads a path into the picture, since the machine the graph runs on is not
the one showing the page.

### Generating whole graphs with AI

`POST /api/ai/generate-graph` asks the AI to author a complete graph document -- nodes,
ports, edges and the page -- from a natural-language description, and reads the answer as
any graph file is read (`parseGraph`). Sent the graph there is as well (`graph`), it hands
that graph back changed as described instead: every node's id is kept, and so is whatever
the change does not touch -- what the answer leaves out of the graph's name and scheme,
where a node stands and the size it was drawn at, and the page, where the answer says
nothing of it, are taken from the graph that was sent. The model is shown what runs, not how
each node was written: each node's history.md, its ✨ prompts and the files ✨ was given come
back from the graph that was sent, never from the answer, and a node the change touched gets
the exchange at the end of its history, as after every ✨ (`engine/src/host/editor/generate.ts`).
The MCP server's `generate_graph` does the same with the `path` of a saved graph. Use it
standalone (e.g. from a script or CI) without touching the editor at all, or:

- **File ▸ ✨ AI Graph…** designs a new graph from a description, which replaces the one
  that is open once you load it.
- **The bar under the canvas** changes the graph that is open. With no node selected it
  says *on: the whole graph*: say what to change and press Enter, and the changed graph
  comes back with what it adds, removes and changes and anything `check` finds in it --
  **Apply** takes it as one undo step, **Discard** leaves the graph as it was. With a node
  selected it says *on: <its heading>*: a code, AI or data node's panel changes its body --
  its code, its prompt.md, what it holds -- as said, and restates its text; for a node that
  is its settings -- a folder node's folder, who starts a start point, an end point's file --
  the graph is changed, about that node. Its **on:** button goes back to the whole graph.
