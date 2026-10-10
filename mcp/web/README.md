# Web reader: an MCP server for AI nodes

An optional tool: **`read_page`** fetches a public web page and hands a model its main
text as Markdown, without menus, ads and comments. A long page comes in pieces that end
at a paragraph.

It is a separate program with its own dependencies. Nothing of it is in the editor, in the
download or in a deployed tool. A graph can only *name* it; the command that starts it
lives in `ai-settings.json` on your machine, as for every tool server.

## Use it

Node 24 or newer.

```bash
cd mcp/web
npm ci
```

Add it to `ai-settings.json` (the path is where you cloned the repository):

```json
{
  "mcp_servers": {
    "web": { "command": "node", "args": ["C:/path/to/Tell-and-Wire/mcp/web/src/main.ts"] }
  }
}
```

In an AI node, open *the node's settings → Tools the model may use* and write `web` (in the
project folder that is `"config": { "mcp_servers": ["web"] }` in the node's entry in
`nodes.json`). The model then reads a page when the node's text asks about one.

This wiring is tested end to end: a graph with such an AI node, run by `node
backend/app/main.ts`, starts this server from `ai-settings.json`, offers the model
`read_page`, hands it the page text and carries on with its answer -- and when the address
is refused, the model is handed the reason and the graph carries on.

A deployed tool does not carry this server: where it runs, the server must be installed
and named in that machine's `ai-settings.json`.

## The tool

`read_page(url, max_chars = 8000, start = 0)`

| Returned | |
|---|---|
| text | the page as Markdown under a line saying where it is from and which characters these are |
| `structuredContent` | `title`, `author`, `published`, `site`, `language`, `word_count`, `final_url` (after redirects), `total_chars`, `start`, `end`, `next_start`, `content`, `warning` |

When `next_start` is a number, call again with `start` set to it to read on; `null` is the
end. The page is fetched once for the five minutes in which its pieces are read.

## What it will not do

| | Default | To change it |
|---|---|---|
| Read this machine or its network (`localhost`, `192.168.x.x`, a cloud host's `169.254.169.254`, ...) | refused, checked on the address actually connected to and again at every redirect | `TW_WEB_ALLOW_PRIVATE=1`: then a page address can reach anything this machine can |
| Read what a site's `robots.txt` forbids | respected, as RFC 9309 says (a missing file allows, one that does not answer forbids) | `TW_WEB_IGNORE_ROBOTS=1`, on your own responsibility |
| Wait | 20 s | `TW_WEB_TIMEOUT_MS` (1 000 to 120 000) |
| Read a large page | 5 MB, counted after unpacking | `TW_WEB_MAX_BYTES` (64 KB to 50 MB) |
| Follow redirects | 5 | |
| Anything but `http` and `https`, an address with a password in it, cookies, logins | never | |
| Run a page's scripts | never: a page that builds its text with JavaScript comes back thin, and says so | |
| Read a PDF | not yet; the answer says so | |

It says who it is: `TellAndWire-Web/0.1 (+https://github.com/Archimedes79/Tell-and-Wire)`.
A site that does not want it can name `TellAndWire-Web` in its `robots.txt`.

## A page is a stranger's text

A page can hold sentences written to instruct a model. The tool says so in its description
and in every answer, but that is a hint, not a wall. An AI node that reads web pages
should be given this tool and nothing that can do harm -- no files, no mail.

## Yours to respect

The requests come from your machine. The terms of use and the copyright of the pages you
read are yours to respect; `robots.txt` is honoured by default, and it is not the law. It
does not log in and does not get around a block: a `403` is reported, not tried again
another way.

## Develop

```bash
npm test             # the tests, against a server on this machine
npm run typecheck
npm run licenses     # every installed package under MIT, ISC, BSD, Apache-2.0 or 0BSD
```

It is TypeScript that Node runs unbuilt, like the rest of the repository.

| File | |
|---|---|
| `src/main.ts` | starts the server on stdin and stdout |
| `src/server.ts` | the tool, its schema and what a model reads |
| `src/page.ts` | fetch, extract, keep, piece |
| `src/safeFetch.ts`, `src/ip.ts` | the one GET: public addresses only, limits, unpacking, charsets |
| `src/robots.ts` | robots.txt |
| `src/extract.ts` | the readable part of a page |
| `src/paging.ts` | pieces that end where a person would stop |

## Third-party

`npm ci` installs these from npm; they are not copied into this repository. Each keeps its
licence, which is in its folder under `node_modules` and in `package-lock.json`.

| Package | Licence | For |
|---|---|---|
| [defuddle](https://github.com/kepano/defuddle) | MIT | the readable part of a page, as Markdown |
| [linkedom](https://github.com/WebReflection/linkedom) | ISC | the page as a document, without a browser |
| [@modelcontextprotocol/server](https://github.com/modelcontextprotocol/typescript-sdk) | Apache-2.0 | the protocol |
| [zod](https://github.com/colinhacks/zod) | MIT | the tool's schema |

The names of products and companies here and in the code belong to their owners; there is
no affiliation with them.
