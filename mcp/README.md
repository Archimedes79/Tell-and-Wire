# Tool servers (MCP)

Optional programs that give an AI node tools. Each is a package of its own, with its own
dependencies and its own lockfile. None of them is in the editor, in the download or in a
deployed tool: whoever runs one installs it.

| Server | Tools | For |
|---|---|---|
| [web/](web/README.md) | `read_page` | a public web page, as Markdown |
| [documents/](documents/README.md) | `read_document`, `list_documents` | Word and PDF files in folders you name |

## How an AI node reaches one

1. Install it: `cd mcp/<server>`, then `npm ci` (Node 24 or newer).
2. Name it in `ai-settings.json` on your machine, under `mcp_servers`: the command that starts
   it is written only there. A graph someone hands you can name a server but never start a
   program of its own choosing. Each README has the entry to copy.
3. In the AI node, open *the node's settings → Tools the model may use* and write the name.
   (In the project folder: `"config": { "mcp_servers": ["<name>"] }` in the node's entry in
   `nodes.json`.)

## What they have in common

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
  `npm run licenses`.

What the tools read -- pages, files -- is not theirs and not ours: the terms and the rights of
the people who wrote it are yours to respect.
