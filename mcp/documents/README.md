# Document reader: an MCP server for AI nodes

An optional tool: **`read_document`** reads a Word (`.docx`) or PDF file inside folders you
name and hands a model its text as Markdown; **`list_documents`** shows what is there. Long
files come in pieces that end at a paragraph.

It is a separate program with its own dependencies. Nothing of it is in the editor, in the
download or in a deployed tool. A graph can only *name* it; the command that starts it, and
the folders it may read, live in `ai-settings.json` on your machine, as for every tool
server.

When a person picks a file on a page, the editor already hands it to a node as text (a Word
file as Markdown) or as the file itself (a PDF). This server is for when the *model* decides
which file to read, for PDFs with a local model (Ollama reads pictures, not PDFs), and for
any other MCP client.

## Use it

Node 24 or newer.

```bash
cd mcp/documents
npm ci
```

Add it to `ai-settings.json`. After `main.ts` come the folders it may read -- one or more:

```json
{
  "mcp_servers": {
    "docs": {
      "command": "node",
      "args": ["C:/path/to/Tell-and-Wire/mcp/documents/src/main.ts", "C:/Users/me/Documents/papers"]
    }
  }
}
```

(`TW_DOCS_ROOTS` can name the folders instead, separated by `;` on Windows and `:` elsewhere.
Without a folder the server does not start.)

In an AI node, open *the node's settings → Tools the model may use* and write `docs` (in the
project folder that is `"config": { "mcp_servers": ["docs"] }` in the node's entry in
`nodes.json`). This wiring is tested end to end: a graph with such an AI node, run by
`node backend/app/main.ts`, starts the server, offers the model both tools, hands it the text
of a Word file and of a PDF, and, when the model asks for a file outside the folder, hands it
the refusal and carries on.

## The tools

`read_document(path, max_chars = 8000, start = 0)` -- `path` is inside the folders, or relative
to the first of them.

| Returned | |
|---|---|
| text | the file as Markdown under a line saying where it is from and which characters these are |
| `structuredContent` | `path`, `kind`, `title`, `pages` (PDF; `null` for Word), `word_count`, `total_chars`, `start`, `end`, `next_start`, `content`, `warning` |

When `next_start` is a number, call again with `start` set to it to read on; `null` is the end.
A PDF is read page by page and each page is marked `[Page n]`, so an answer can say where it
found something. A Word file comes with its headings, lists, bold and italic and tables, as the
editor reads one; pictures, footnotes and equations are left out.

`list_documents(folder?)` -- the Word and PDF files and the folders directly inside a folder
(the first one when left out), at most 200, dot files not shown.

## What it will not do

| | |
|---|---|
| Read outside its folders | Links and `..` are resolved first, then the real path must lie inside a folder. "Not there" and "not allowed" get the same answer, so a model learns nothing about what exists outside. |
| Write, change or delete anything | It only reads. |
| Read anything but `.docx` and `.pdf` | Not `.doc`, `.rtf`, `.odt`; the answer says so. |
| Read a scan | A PDF that is a picture of text has no text layer, and nothing here reads pictures (no OCR). The answer says so; some pages without text only draw a warning. |
| Read a big file | 50 MB (`TW_DOCS_MAX_BYTES`), 500 pages (`TW_DOCS_MAX_PAGES`); a Word file may not unpack to more than 100 MB. |
| Open a password-protected PDF | The answer says so. |
| Fetch from the network | It reads local files. [`../web`](../web/README.md) reads web pages (and says PDFs are not its business). |

## A document is someone else's text

A file can hold sentences written to instruct a model, in plain sight or hidden. The tool says
so in its description and in every answer, but that is a hint, not a wall. An AI node that
reads documents should be given this tool and nothing that can do harm -- no mail, no
writing files.

## Yours to respect

What a model reads here goes to the model you have chosen. With a model on this machine it
stays here; with a model through someone's API it leaves it. For confidential documents --
contracts, patents not yet published, personal data -- use a local model, and mind who may
see the file at all.

## Develop

```bash
npm test             # the tests, with PDFs and Word files written by hand
npm run typecheck
npm run licenses     # every installed package under MIT, ISC, BSD, Apache-2.0 or 0BSD
```

It is TypeScript that Node runs unbuilt, like the rest of the repository.

| File | |
|---|---|
| `src/main.ts` | starts the server on stdin and stdout, for the folders given |
| `src/server.ts` | the two tools, their schemas and what a model reads |
| `src/documents.ts` | find, read, keep, piece |
| `src/roots.ts` | the folders: what a path may point at |
| `src/pdf.ts` | the text layer of a PDF |
| `src/docx.ts` | a Word file as Markdown (the editor's own reading, copied: this package imports nothing from the others) |
| `src/paging.ts` | pieces that end where a person would stop (the same as `../web`'s) |

## Third-party

`npm ci` installs these from npm; they are not copied into this repository. Each keeps its
licence, which is in its folder under `node_modules` and in `package-lock.json`.

| Package | Licence | For |
|---|---|---|
| [unpdf](https://github.com/unjs/unpdf) | MIT | the text layer of a PDF; it carries Mozilla's pdf.js (Apache-2.0) inside |
| [@modelcontextprotocol/server](https://github.com/modelcontextprotocol/typescript-sdk) | Apache-2.0 | the protocol |
| [zod](https://github.com/colinhacks/zod) | MIT | the tools' schemas |

The names of products and companies here and in the code belong to their owners; there is no
affiliation with them.
