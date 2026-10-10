<div align="center">

# Tell & Wire

**A visual node editor for AI workflows and small local tools: say in plain words what
each node should do, wire the nodes into a graph, give it a page, and hand it on as a
folder that runs wherever Node runs -- offline, with a local model, if you like.**

### ⬇ [Windows](https://github.com/Archimedes79/Tell-and-Wire/releases/latest/download/tell-and-wire-windows.zip) · [Linux](https://github.com/Archimedes79/Tell-and-Wire/releases/latest/download/tell-and-wire-linux.zip)

<img src="docs/images/hero.png" alt="The Tell & Wire editor with a node opened in place of the canvas: its text on the left, the files AI wrote from it on the right -- and the same graph delivered as a tool that draws a bar chart" width="100%">

</div>

## What it is

Tell & Wire is a node-based, no-code editor for AI workflows: you describe what each step
should do, and a model writes it. The tools you build -- a chart from a CSV, a summary of
every file in a folder, a chat, a panel of AI reviewers -- run on your own computer, with a
local LLM (Ollama, LM Studio) or a model API of your choice.

A tool in Tell & Wire has two halves.

- **The graph** (Graph tab): nodes wired together. A run begins at a **start point**,
  runs through **code nodes**, **AI nodes**, **data nodes** (a struct kept between runs)
  and **subgraphs**, and ends at **end points**.
- **The page** (Page tab): blocks such as text, a file picker, a dropdown, a slider, a
  button, a chart, a table or a chat. A block starts the graph at a start point and shows
  what an end point hands back. It connects by name; nothing is wired to the page.

A node is a heading and a short text that says what it should do. ✨ writes the node's
files from that text: `input.js` and `output.js` (what goes in and out, each with an
example) and `code.js` or `prompt.md`. **Pull input** reads `input.js` off the graph, and a
chat for each file changes it as you say. Every file is plain text in the tool's folder, so
you can read it, change it and diff it.

**▶ Run** runs the tool in the App tab, as its user will see it. A run that went well
can be kept as an offline test. **File → Deploy as zip** writes a zip that anyone with Node can unzip and
start. Tell & Wire also serves an MCP server, so an assistant can build and test graphs.
The editor and every deployed tool listen on `127.0.0.1` only, and there is no telemetry.
A code node's JavaScript runs in a process of its own: it reads the working directory
(not `ai-settings.json`), writes only the temp folder, starts no program and holds no key.
The network stays open to it.

## Download and start

Download [tell-and-wire-windows.zip](https://github.com/Archimedes79/Tell-and-Wire/releases/latest/download/tell-and-wire-windows.zip)
or [tell-and-wire-linux.zip](https://github.com/Archimedes79/Tell-and-Wire/releases/latest/download/tell-and-wire-linux.zip)
(x64, Node.js included), unzip it and start `run.cmd` (Windows) or `./run.sh` (Linux). The
editor opens in your browser on <http://127.0.0.1:8000>, or on the next free port. Older
versions are on the [releases page](https://github.com/Archimedes79/Tell-and-Wire/releases).

## Run from source

Node 24 or newer, on Windows, macOS or Linux:

```bash
git clone https://github.com/Archimedes79/Tell-and-Wire.git
cd Tell-and-Wire
./start.sh        # macOS, Linux
.\start.ps1       # Windows PowerShell (a bare `start` is a PowerShell command)
start.cmd         # Windows cmd, or double-click it
```

The launcher installs on first use, builds the page when its sources changed, restarts an
editor already on the port and opens the browser; `stop.*` stops it. By hand it is
`npm ci`, `npm run build`, then `npm start` (`node backend/app/main.ts --editor frontend/dist`).
`npm run dev` serves the page with live reload on <http://127.0.0.1:3000>. Keep a checkout
out of folders that Dropbox or OneDrive sync: they lock files during `npm ci` and the build.

A graph also runs without the editor. Paths inside a graph resolve against the working
directory, so run the examples from the repository root:

```bash
node backend/app/main.ts examples/population_plotter          # run once, print the result as JSON
node backend/app/main.ts check examples/population_plotter    # what is wrong, without running
node backend/app/main.ts test --offline examples/nested_statistics   # node examples and kept runs
node backend/app/main.ts my_tool --serve                      # serve its page
node backend/app/main.ts my_tool --bundle ./out               # write a deployable folder
node backend/app/main.ts --mcp --mcp-root ./tools             # an MCP server on stdio
```

## Set up a model

✨ asks a model to write a node's files, and an AI node asks one each time it runs.

Open **⚙ Settings**, fill in what you need, press **Save**:

- **AI**: the provider and model. This one setting serves ✨, ▶ Try and every AI node
  that does not name its own model.
- **Keys** and **Server addresses**: paste an API key or a server address. Keys are
  write-only: saved on this machine, never shown again.

Settings are saved in `ai-settings.json`. It is looked for in the working directory, then in the
folder that holds `graph/` (beside `run.sh` in a download or a bundle), then as
`~/.tell-and-wire/settings.json`; `TW_SETTINGS` names one file instead. The file is
gitignored; `ai-settings.example.json` shows its shape. Environment variables win over the
file: `TW_AI_PROVIDER`, `TW_AI_MODEL`, and the key and address variables below.

| Provider (id) | Cost | Key or address |
|---|---|---|
| Ollama (`ollama`) | free, local | `OLLAMA_BASE_URL` (default `http://localhost:11434`) |
| LM Studio (`lmstudio`) | free, local | `LMSTUDIO_BASE_URL` (default `http://localhost:1234/v1`) |
| Google Gemini (`google`) | free tier | `GOOGLE_API_KEY`, from [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| GitHub Models (`github_copilot`) | free tier | `GITHUB_TOKEN` with the `models:read` scope |
| OpenAI (`openai`) | paid | `OPENAI_API_KEY` |
| Anthropic (`anthropic`) | paid | `ANTHROPIC_API_KEY` |
| OpenAI-compatible (`openai_compatible`) | depends | `OPENAI_COMPATIBLE_BASE_URL`, `OPENAI_COMPATIBLE_API_KEY` |

With nothing set, Tell & Wire uses a local model server that is running (Ollama or
LM Studio), else Ollama. For Gemini, use the `-latest` model names; dated names are retired.

**Tools for an AI node.** An AI node can call tools from [MCP](https://modelcontextprotocol.io)
servers: list them under *the node's settings → Tools the model may use*, one per line -- an
`https://…/mcp` address, or a name this machine's `ai-settings.json` defines:

```json
{ "mcp_servers": {
    "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "C:/data"] },
    "internal":   { "url": "https://mcp.example.com/mcp", "headers": { "Authorization": "Bearer …" } } } }
```

A graph can name a server but never the command that starts one, so a graph someone hands
you cannot start a program of its choosing. A server started by `command` does not
inherit variables named like keys, tokens, secrets or passwords from the environment: give
it what it needs in its own `env`. A tool call gets two minutes
(`TW_MCP_TIMEOUT_MS`, `0` for none), and the model at most eight turns of calls per answer.

## Docker

```bash
docker compose up --build    # the editor beside an Ollama container, on 127.0.0.1:8000
docker run -p 127.0.0.1:8000:8000 -v ./data:/app/data ghcr.io/archimedes79/tell-and-wire:latest
```

## Examples

[`examples/`](examples/) holds seven tools, each a folder; open one with **File → Open…**. The
simplest are population_plotter (choose a CSV, see a chart; no model), folder_summaries
(a summary of each file in a folder) and chat (a chat block and an AI node).
file_summarizer starts one run from a picker, a dropdown and a button. nested_statistics
shows a subgraph, a hand-written page and a kept test. paper_review_panel and
portfolio_review are teams of AI reviewers.

## Documentation

- [docs/user-guide.md](docs/user-guide.md): how to build a tool, step by step.
- [docs/architecture.md](docs/architecture.md): the parts and their folders, the rules
  between them, the tool's folder format, the wrapper's APIs and the core protocol, and how to
  extend Tell & Wire.
- [mcp/](mcp/README.md): optional tool servers that let an AI node read web pages and Word and
  PDF files. Each has its own dependencies; none of it is in the download.

## Licence

Source-available under [PolyForm Noncommercial 1.0.0](LICENSE), not open source:
noncommercial use is free, commercial use needs a separate licence (open an issue), and
what you build is yours.

## Trademarks

Ollama, LM Studio, OpenAI, Anthropic, Google Gemini, GitHub Models, Node.js and the other
product names in this document belong to their owners. Tell & Wire is not affiliated with
or endorsed by them; the names only say what it can connect to or run on.
