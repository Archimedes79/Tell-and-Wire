# Tool servers (MCP)

Programs that give an AI node tools. Each is a folder of its own here, with its own packages.
They come with the download, installed; a deployed tool carries none.

| Server | Tools | For |
|---|---|---|
| [web/](web/README.md) | `read_page` | a public web page, as Markdown |
| [documents/](documents/README.md) | `read_document`, `list_documents` | Word and PDF files in folders you name |

## Add one to an AI node

In the node's settings: **Tools the model may use → + Add MCP server**, then pick one.

- It installs the server's packages if they are not there (npm; the download has them).
- It asks for what the server needs: the document reader asks for its folders, the web reader
  for nothing. The server brings its own page for that (below).
- It writes the command that starts the server into `ai-settings.json` on this machine, starts
  it once to see that it starts, and puts its name on the node.

**Edit config** on the node changes the settings later; **Remove** takes the server off the
node and leaves its settings on the machine. A graph only *names* a server, so one someone hands
you can never start a program of its choosing: what starts is written here, by the editor,
from the server's own folder. The editor must run on this machine; in a container, write the
entry by hand (the next section).

## What is in a server's folder

```
mcp/<name>/
  config.json        how it starts and what it reads
  settings.html      optional: the server's own page for its settings
  src/ package.json package-lock.json README.md
```

`config.json`, in full:

```json
{
  "title": "Document reader",
  "about": "One line, shown when you pick it.",
  "command": "node",
  "args": ["src/main.ts"],
  "env": { "TW_DOCS_ROOTS": "What it means, in a sentence." },
  "required": ["TW_DOCS_ROOTS"]
}
```

`command` and `args` run from the server's folder (`node` is the Node that runs the editor).
`env` lists the environment variables the server reads, and that is all it can be given: the
editor refuses any other. `required` names those it does not start without.

`settings.html` is plain HTML and script, shown in a frame that is sandboxed and has no
network. It talks to the editor through `tw`, and through nothing else:

| | |
|---|---|
| `tw.init((values, host) => …)` | the values saved so far, by variable; `host.delimiter` separates a list of folders in one |
| `tw.changed(values, valid)` | what the page now holds, as text per variable; `valid` false keeps **Add** off |
| `tw.browse(from)` | the editor's folder browser; the folder picked, or `null` |

Labels, inputs, buttons, `.row`, `.help` and `.dim` already look like the editor. A server with
no page gets its variables as `NAME=value` lines, each explained under the box.

## A server that does not come with Tell & Wire

A URL, or a program such as `npx -y some-server`: write it in `ai-settings.json` as Claude
Desktop's `mcpServers` has it, under `mcp_servers`, and name it in the node (**Add MCP server →
Another server**; in a project folder `"config": { "mcp_servers": ["<name>"] }` in the node's
entry in `nodes.json`). The editor does not write or change an entry it did not write.

## What the servers here have in common

- They only read. Each tool is marked read-only.
- What they may touch is closed by default: the public web only (`web`), the folders you name
  (`documents`). A path or an address that leads elsewhere is refused with a reason.
- What they return is labelled as untrusted text. Give an AI node that reads strangers' text
  these tools and nothing that can do harm.
- Limits on time and size, said in each README, with the variable that changes each.
- TypeScript that Node 24 runs unbuilt, like the rest of the repository; checks in each
  folder (`npm test`, `npm run typecheck`, `npm run licenses`), run by
  `.github/workflows/mcp.yml` when something here changes.
- Every package they install is under MIT, ISC, BSD, Apache-2.0 or 0BSD, checked by
  `npm run licenses`. The download carries them as `npm ci --omit=dev` leaves them, each with
  its licence file.

What the tools read -- pages, files -- is not theirs and not ours: the terms and the rights of
the people who wrote it are yours to respect.
