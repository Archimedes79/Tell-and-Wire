# The MCP server

Lets an assistant outside Tell-and-Wire — Claude Code, Claude Desktop, any
[Model Context Protocol](https://modelcontextprotocol.io) client — design a graph,
check it, save it and run it, without the editor being open.

Two ways to get a graph out of it, and the difference matters:

- **The assistant writes it.** It reads `authoring_guide`, writes the JSON itself,
  and hands it to `validate_graph` and `save_graph`. Needs no model on this machine,
  and a strong assistant usually writes a better graph than a small local model.
- **This machine's model writes it.** `generate_graph` asks the one AI setting from
  ⚙ Settings (see [ai-providers.md](ai-providers.md)) — the same call the editor's
  "generate a graph" makes.

It is one process on stdio, started by the client, with no port and no dependencies.
(Not to be confused with `mcp_servers` in `ai-settings.json`: that is the other
direction, tools a *graph's* AI node may call.)

## Registering it

Claude Code:

```sh
claude mcp add tell-and-wire -- node <repo>/engine/src/main.ts --mcp --mcp-root <project folder>
```

Claude Desktop, in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tell-and-wire": {
      "command": "node",
      "args": ["<repo>/engine/src/main.ts", "--mcp", "--mcp-root", "<project folder>"]
    }
  }
}
```

Use absolute paths for both. Node 24 or newer, as for the rest of the engine.
`--mcp-root` is the one folder the server may touch; without it, that is the folder
the client started the process in. A deploy bundle does not contain the server — it
is authoring, and ships with the editor only.

To check a registration without an assistant in the loop, the official
[MCP Inspector](https://github.com/modelcontextprotocol/inspector) speaks to it from the
command line. Put the `mcpServers` block above in a file and name it — given the command
inline, the Inspector takes `--mcp` for a flag of its own and the server never starts:

```sh
npx @modelcontextprotocol/inspector --cli --config servers.json --server tell-and-wire --method tools/list
npx @modelcontextprotocol/inspector --cli --config servers.json --server tell-and-wire \
    --method tools/call --tool-name run_graph --tool-arg path=graphs/count_rows.json
```

## The tools

| Tool | Arguments | What it does |
|---|---|---|
| `authoring_guide` | — | The authoring prompt the editor's own generation uses — the JSON shape, each node type and block kind, how a page connects to start and end points, one complete example — and the node types this engine runs. Read before writing a graph by hand. |
| `generate_graph` | `description`, `path?`, `save_as?` | Has the model configured on this machine design a graph -- or, with `path`, change that saved graph as described, its ids and what the change does not touch kept, each node's history too. Returns the graph (without any node's history: that stays in the project), the explanation and any problems; with `save_as`, writes it if there are none. Says so plainly when no model is configured. |
| `validate_graph` | `graph` *or* `path` | Lists what is wrong, each with where and how to fix it. Empty list = valid. |
| `save_graph` | `path`, `graph` | Validates, then writes pretty JSON. Refuses a graph with problems and returns them. |
| `run_graph` | `path`, `values?`, `event?` | Runs once: with `event`, the round that start point begins, sent `values`; without, the whole graph, sent nothing. Reports overall status, each node's status and error, each node's outputs, and the graph's outputs by name, every value cut to about 600 characters. |
| `describe_graph` | `path` | What the graph offers by name: its start points — who starts each, what the graph reads of what each is sent, and for one the page starts, which blocks fire it and what the page sends — and its end points. The names `run_graph` takes. |
| `run_node` | `path`, `node_id`, `inputs?` | Runs one node by itself: on the inputs given, or on what the nodes feeding it produce. For writing one node at a time. |
| `test_graph` | `path`, `node_id?`, `offline?` | Runs each code and AI node once on the example in its `input.js` and holds what comes out to its `output.js` -- also inside the graphs nodes hold, named with the way down (`part ▸ work`) -- and reports each as pass, fail (with what does not fit), error or skipped. A project also runs again each round it kept (`tests/<name>.json`), asking no model, and reports each under `rounds`: pass when its end points hand back what they did, fail with what differs. |
| `list_graphs` | — | The graphs under the root: path, name, description, node count. A project is listed once, by its `flow.json`. Four folders deep, 200 at most. |

A project folder is reached through its `flow.json` (`examples/chat/flow.json`): reading
it puts the graph together from the node folders under `nodes/` and its page from
`page/page.json`, and `save_graph` to it writes them back there, the way the editor
saves — every one of those files held to the same folder the server is confined to. Any
other `.json` path is one file with everything inline.

`validate_graph` finds the mistakes that are silent at run time: an unknown
`node_type` or block kind; duplicate node, edge or block ids; an edge to a node that
is not there, or to a port the node does not have — checked against the ports the
engine *derives* (a start point's `data`, a folder node's, a subgraph's from the graph
it holds), not the ones the document claims, with `__run` accepted everywhere and
`error` on a node told to catch its failures; a cycle that does not pass through a node
that remembers; a code node with no `config.code`; end points that share a label; a
graph with no `end` node, which computes its answer and shows nobody; and what is wrong
with the page — a block connected to nothing, a start or end point the graph does not
have, a start point the page starts that nothing on the page fires, an input that takes
a part no block sends (`host/editor/mcpServer.test.ts`, `validate_graph`).

A graph is used by name, as a page or any frontend uses it (`execution/graphInterface.ts`):
`event` names one of its start points and runs only what that start point is wired to.
`values` are what that start point is sent, in one package, under names of the caller's
own — the parts `describe_graph` says the graph reads (`reads`), and for a start point the
page starts, the block ids the page sends under (`sends`) — as `--value` sends them on the
command line, there each a text. Values go only with an event: a run without one is the
whole graph, the page's start points sent what the page holds, and values sent with it are
refused. An event the graph does not offer is refused, with the ones it does
(`host/editor/mcpServer.test.ts`: "sends values to the start point the event names, and
refuses them for a round of the whole graph", "refuses an event the graph does not offer,
and a graph that is not there"). A run calls the configured model (or a node's own) and
runs its code for real.

## What it is confined to

The caller is a model acting on text it read somewhere, so every argument is treated
as if a stranger wrote it. Each rule below has a test (`host/editor/mcpServer.test.ts`, `confinement`).

- **One folder.** Every path is resolved against the root and must stay inside it:
  `..`, an absolute path elsewhere and another drive are refused alike. Checked as
  written and again after following links, so a symlink or junction inside the root is
  not a way out.
- **Only a `.json` path,** with no character a file name cannot be trusted with, and never under a dot-folder, `node_modules` or `dist`. A
  project is named by its `flow.json`; saving it writes its nodes' files (`code.js`,
  `prompt.md`, …) and its `page/page.json` in its folder, inside the root, as the editor
  does.
- **A file that exists is replaced only if it is already a graph.** `save_graph`
  cannot overwrite `package.json`: it has no `nodes`.
- **`ai-settings.json` is never opened** by any tool, under any spelling.
- **Nothing returned carries a key,** an environment variable or settings content. A
  provider's error message passes through — it is how you learn a model name is wrong —
  with anything matching a configured secret blanked first. The same filter runs over
  every result, a run's outputs included.
- **Sizes are bounded** both ways: a description up to 20,000 characters, a graph up
  to 2 MB, a run's values truncated.

**What it does not confine is a graph that runs.** `run_graph` executes code nodes in
the same sandbox as every other run (`core/node.ts`): no child processes, no native
addons, no worker threads — but files and the network stay open, because reading
files is what most graphs are for. The root fences in what the *tools* touch, not
what a graph's own code touches. So point `--mcp-root` at a project folder, not at
your home directory, and treat "run this graph" like "run this script".

The server moves into its root when it starts, so a relative path inside a graph —
`data/sales.csv` on a file picker — is relative to the root too.

## A worked exchange

> **You:** Make me a graph that counts the rows in `data/sales.csv` and shows the number.

The assistant calls **`generate_graph`**:

```json
{ "description": "Read data/sales.csv, count its rows, and show the count.",
  "save_as": "graphs/count_rows.json" }
```

```json
{ "model": "google / gemini-flash-latest",
  "saved": "graphs/count_rows.json",
  "problems": [],
  "explanation": "A file picker on the page starts on data/sales.csv and fires the start point \"count\"; a code node takes the file's content from its package and counts the rows; the end point \"Rows\" is the result, which the page shows.",
  "graph": { "metadata": { "name": "Count rows" }, "nodes": ["…"], "edges": ["…"], "page": { "blocks": ["…"] } } }
```

Had the model wired the start point's port `output` instead of `data`, nothing would
have been written, and `problems` would say so:

```json
{ "where": "edge \"e1\"",
  "problem": "Its source port \"output\" is not an output of node \"count\".",
  "fix": "The ports of a start node are derived from its settings, not from what the document declares. Its outputs are: \"data\". Wire to one of those, or change the settings that produce them." }
```

The assistant fixes the edge, checks with **`validate_graph`** `{ "graph": { … } }` →
`{ "valid": true, "problems": [] }`, writes it with **`save_graph`**, and tries it
with **`run_graph`** `{ "path": "graphs/count_rows.json" }`. With no event the whole
graph runs, and the start point is sent what the page's picker holds:

```json
{ "status": "success",
  "nodes": [
    { "id": "count", "status": "success", "outputs": { "data": { "event": { "name": "count", "by": "page" },
        "values": { "file": { "path": "…/data/sales.csv", "content": "region,amount\nnorth,120\n…" } } } } },
    { "id": "rows",  "status": "success", "outputs": { "rows": 1204 } },
    { "id": "shown", "status": "success", "outputs": { "value": 1204 } } ],
  "outputs": { "shown": 1204 } }
```

To count another file without the page, **`describe_graph`** says what to send — `count`
reads `file.content` — and `run_graph` `{ "path": "graphs/count_rows.json", "event":
"count", "values": { "file": { "content": "…" } } }` sends it in the page's place.

With no model configured, `generate_graph` answers with that fact and the
way round it; the assistant calls **`authoring_guide`**, writes the same graph itself,
and the rest of the exchange is unchanged. Open `graphs/count_rows.json` in the editor
afterwards to see it, lay it out, or bundle it.
