# Document reader: an MCP server for AI nodes

An optional tool: **`read_document`** reads a Word (`.docx`) or PDF file inside folders you
name and hands a model its text as Markdown; **`list_documents`** shows what is there. Long
files come in parts that end at a heading, a page or a paragraph, each saying which section
and which pages it covers.

It is a separate program with its own dependencies. Nothing of it is in the editor, in the
download or in a deployed tool. A graph can only *name* it; the command that starts it, and
the folders it may read, live in this folder's `server.json` on your machine, as for every
tool server.

Word files are read here and nowhere else: when a person picks a `.docx` on a page, a node is
handed its path, not its text. A PDF or a picture is handed to a node as the file itself,
which a model that reads PDFs reads. This server is for when the *model* decides which file
to read, for Word files, for PDFs with a local model (Ollama reads pictures, not PDFs), and
for any other MCP client.

## Use it

Node 24 or newer.

```bash
cd mcp/documents
npm ci
```

Copy `server.example.json` to `server.json` in this folder (it is not committed) and put the
folders it may read after `src/main.ts` -- one or more. It is started in this folder, and its
name is the name of the folder, `documents`.

(`TW_DOCS_ROOTS` can name the folders instead, separated by `;` on Windows and `:` elsewhere.
Without a folder the server does not start.)

In an AI node, open *the node's settings → Tools the model may use* and write `documents` (in the
project folder that is `"config": { "mcp_servers": ["documents"] }` in the node's entry in
`nodes.json`). This wiring is tested end to end: a graph with such an AI node, run by
`node backend/app/main.ts`, starts the server, offers the model both tools, hands it the text
of a Word file and of a PDF, and, when the model asks for a file outside the folder, hands it
the refusal and carries on.

## The tools

`read_document(path, max_chars = 8000, start = 0, outline = false)` -- `path` is inside the
folders, or relative to the first of them.

| Returned | |
|---|---|
| text | the file as Markdown under a line saying where it is from and which characters these are |
| `structuredContent` | `path`, `kind`, `title`, `pages` (PDF; `null` for Word), `word_count`, `total_chars`, `start`, `end`, `next_start`, `chunk_index`, `chunk_count`, `section`, `page_range`, `content`, `warning`, and with `outline` the list of parts |

When `next_start` is a number, call again with `start` set to it to read on; `null` is the end.
A PDF is read page by page and each page is marked `[Page n]`, so an answer can say where it
found something. A Word file comes with its headings, lists, bold and italic and tables, as the
editor reads one; pictures, footnotes and equations are left out.

## Long files, in parts

A file that is longer than `max_chars` comes in **parts**, and each part ends where a person
would stop reading, not where a count ran out:

- a heading starts a new part once the one before is a fair size (40 % of `max_chars`), and is
  never left at the end of one, away from the text it heads;
- a table and a code block are not cut in the middle; one that is too big for a part is cut
  between rows or lines, each piece with its table header or its fence;
- the rest is cut at paragraphs, and only then at a sentence or a space.

Each part says which **section** it is in (the headings above it, `Methods > Data`), and which PDF **pages** it covers (`page_range`, `"3"` or `"3-4"`).
`chunk_index` and `chunk_count` say which part of how many it is; `next_start` leads to the next.
`outline: true` adds a list of every part -- section, size, `start` -- without their text, to choose
one: read it by passing its `start`.

**Size for a small model.** `max_chars` is characters, not tokens: about 4 to a token in English,
fewer in German and in most other languages. A part of about a quarter of the model's context
leaves room for its instructions, its answer and the parts it has already read: for a model with
4 000 tokens of context, about 3 000 characters; for 8 000 tokens, 8 000; for 32 000, 30 000.
A part is never longer than `max_chars`.

The whole file is read once for the five minutes in which its parts are read; every call after
the first costs nothing but the cut.

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
| `src/chunk.ts` | the text cut into parts: headings, tables and code blocks kept whole (the same file as `../web`'s) |
| `src/paging.ts` | the cut inside a paragraph, where it ends at a line, a sentence or a space (the same file as `../web`'s) |

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
