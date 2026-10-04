# User guide: make a small tool in 30 minutes

How to go from nothing to a working tool with the mouse, and where the time goes. It was
written by building the [population plotter](../examples/population_plotter/) in the
editor from an empty canvas, on `gemini-flash-lite-latest`; what is measured says so, the
rest is an estimate.

A *small tool* here means what the three master examples are: **a page, a start point, one
node and an end point** — choose a file, get a chart; choose a folder, get a summary of
each file; a chat with a model. [`masterExamples.test.ts`](../editor/src/masterExamples.test.ts)
builds each of them the way this guide does (blocks added, a node dropped, a wire dragged)
and runs it.

## The time budget

| Step | Time | What decides it |
|---|---|---|
| Download, unzip, start | 3–5 min | A zip of about 37 MB (Windows) or 47 MB (Linux) in 0.5.0; Node.js is inside. |
| Give it a model | 5 min hosted · 10–60 min local | Hosted: an account and an API key. Local: installing a runtime and downloading a model of several GB. |
| Build the page | 1–2 min | Two blocks for the plotter, and one setting: what choosing a file starts. |
| Add a node and wire it | 1–2 min | Two drags. |
| ✨ writes the node's three files | 1–2 min | Measured: each of the three finished within the 8–15 s waited for it, on a small hosted model. |
| Run it, look, correct one thing | 3–10 min | **This is where the time goes** — see below. |
| Save, hand it on | 2 min | A folder name; one click on 🚀. |

About **15–25 minutes** for a first tool of this size, with a hosted model: that is inside
30. The tool with a model in it (section 6) adds about ten, estimated, because its input has
to be named and told to run per item.

It is not inside 30 when the model has to be downloaded first, when the data is messier than
the sample, or when the tool grows past about four nodes. The sections below say what costs
the time.

## 1. Install (3–5 min)

Download the zip for your system from the [releases page](https://github.com/Archimedes79/AI_Graph/releases/latest)
— [Windows](https://github.com/Archimedes79/AI_Graph/releases/latest/download/ai-graph-windows.zip)
or [Linux](https://github.com/Archimedes79/AI_Graph/releases/latest/download/ai-graph-linux.zip),
both x64 — unzip it, and start `run.cmd` (Windows) or `./run.sh` (Linux). The editor opens in
your browser on <http://127.0.0.1:8000>, or the next free port. Nothing else is installed.

macOS, or a checkout instead of a zip: Node 24 or newer, then `./start.sh` — see
[install.md](install.md). Keep a checkout out of a folder that Dropbox or OneDrive syncs:
they lock files while `npm ci` and the build replace them, and both fail with `EBUSY` or `EPERM`.

## 2. Give it a model (5 min)

✨ writes a node's files by asking a model, and an AI node asks one every time it runs. So
this comes before the first node.

1. Get a free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. In the editor: **⚙ Settings → Keys and addresses**, paste it next to *Google Gemini*,
   **Save**. Keys are write-only: they are saved on this machine and never shown again.
3. In the same dialog, under **AI**: provider *Google Gemini — free tier*, model
   `gemini-flash-lite-latest`, **Save**. The line *Now: google / gemini-flash-lite-latest*
   confirms it.

Use the `-latest` names: dated Gemini names are retired. A small, fast model is the right
choice for ✨: in the run this guide comes from, each file was written in seconds. A larger
one writes better code and takes longer; a model on your own machine (Ollama, LM Studio —
[ai-providers.md](ai-providers.md)) costs nothing per call but can take minutes per answer,
more with a model that "thinks". With nothing set, the editor takes a local model that is running (Ollama or LM Studio),
else Ollama, and ✨ fails until one is running.

## 3. Build the tool (about 10 min)

The example is the population plotter: choose a CSV of countries and numbers, see a bar
chart. Its pieces are a **page** (what the person sees), a **start point** and an **end
point** (where a round begins, and what it hands back), a **node** (what it does), and two
**wires**: from the start point into the node, and from the node to the end point.

**The page.** Name the tool in the field at the top left, then open the **Gui** tab. The
left column lists blocks; click **File or folder**, then **Chart**. They appear on the page,
each connected as it is made: what the picker holds goes to a new start point, *Start*, and
the chart shows a new end point named after it, *Chart* -- give the chart another label and
the end point takes it too. (Typing `/` on the page opens the same list.)

Click the picker: its settings are on the right. Under **Its data goes to**, *Start (start)*
is ticked, and **Using it fires** says *⚡ Start (start)*: nothing else on the page fires
that start point, so the first block that can, does -- choosing a file is what runs the
graph. (A button fires the start point it is made for whatever else does; a second picker
or box only sends to it, until its own **Using it fires** says otherwise.) That is the whole
page: a block that asks for a file and starts the graph, and a block that shows what
arrives.

**The node.** Back on the **Graph** tab, the two points are already on the canvas: *Start*,
whose card says which blocks fire it and send to it (*⚡ File or folder · sent File or
folder*), and *Chart* (*shown on Chart*). Click the gear in the left column — the code
node — and it appears, with its panel open on the right.

**The wires.** Drag from the start point's *Data* dot — the diamond on its right edge — to
the code node's input dot, and from the code node's output dot to the end point's *Value*
dot (a dot's name shows while the pointer is on its card). The first wire also says
what the input takes of what the start point is sent: the chosen file's content, as text.
The *takes* box under the port, in the panel's **Advanced**, shows it — *File or folder ·
content* — and changes it. **Advanced** stays open, or folded, as you left it on the last
node of the same kind.

**The node's text.** In the panel, the top box is the node in your own words. Say what it
should do, with what comes in and what goes out:

> Read the population CSV (a country column and a population column) and show a bar chart
> of the population per country.

**✨ writes the rest.** Press **✨ Input**, then **✨ Output**, then **✨ Code**, in that
order — each is written from the one before. You get three files, each shown in the panel
and each a plain file in the project folder:

- `input.js` — what one call of the node is handed, with an example. Here a CSV as text.
- `output.js` — what it hands on, with an example. Here a chart: kind, title, points.
- `code.js` — the function between them. It is tried on the example and repaired before you
  see it.

You do not have to write any of them; you can change any of them. A node's name follows its
text. To change one thing later, say it in the bar under the canvas — *Say what to change*,
scoped to the open node or to the whole graph — rather than editing by hand.

**Shortcut:** **Generate** in the toolbar (the wand: *Write every empty node, in the order the
graph runs*) writes the files of every node that has none yet, so a graph of several nodes with their texts
is one click.

## 4. Run it (2 min)

**▶ Run** runs the application, as an IDE does: the page opens on the **App** tab and waits
to be used. Choose a CSV in the picker — **📂 Browse…**, or type its path and press Enter —
and the chart is drawn: choosing the file fires *Start*, and the round runs what *Start* is
wired to. After a run, every node shows what it made under its port, so a wrong node is
visible in place.

There is a sample at [`examples/data/three_countries.csv`](../examples/data/three_countries.csv).

A round started while a picker that sends to its start point has nothing chosen — a button
pressed before a file was picked — first opens *Before running…*, which asks for the file.

The bar under the tool's name says the last round in a line: what began it and how its
nodes went — *Last round: "Summarize", from "File" -- 3 ran* — with why each node
that did not run did not under it, as each such node's card on the graph says too. **What
using it keeps** folds away what the session holds that the design does not say — what the
start point was sent, what memory holds, what each block holds — and **↺ Start over**
forgets it all; the delivered page has **↺ Start over** too. **Keep as a test**, beside the
line, keeps a round of a saved project that went as it should in its `tests/` folder:
`test` runs it again, asking no model, and holds what comes back to what came back then.

## 5. Save it and hand it on (2 min)

**File → Save as…** and a name without `.json` makes a **project folder**:
`flow.json` (the nodes and a line per wire), `layout.json` (where the nodes sit), `page/` (the
blocks), and one folder per node under `nodes/` — the start and end point too — with its
settings in `node.json`, its ports in `interface.json`, and for the code node its `input.js`,
`output.js` and `code.js`. They are plain text, so `git diff` reads them and your own editor
can open them. A name that is taken -- a project or a `.json` graph already there -- is not
written over: the dialog says so, and **Replace** writes over it.

**🚀 Deploy** downloads the tool as a zip: the engine, the graph and its page. Whoever receives it
unzips it and starts `run.cmd` or `run.sh`; the page is there, with no editor.

## 6. A tool with a model in it: summarize a folder (about 10 min)

The same pattern with an AI node: choose a folder of `.txt` files, and one window shows a
summary of each. The sample is [`examples/data/stories/`](../examples/data/stories/), three
short stories. It differs from the plotter in three places, and the third is the one that
cost the most time to find.

**The page.** Click **File or folder** and **Text output**. On the picker: set **Using it
fires** to *⚡ Start (start)* (choosing a folder is what runs it), **Mode** to *Directory
(list of files)*, **File types** to `.txt`, and **Folder** to where the stories are. A path
typed there is what the page starts on.

**The node and the wires.** On the Graph tab, click the AI node in the left column. Wire
the start point's *Data* dot to its left dot, and its right dot to the *Value* dot of
*Text output*, the end point the text block shows. A wire from a start point that a folder
picker sends to makes the input take the folder's files, a list of paths, each read where
it arrives: what the node is handed is the text.

**Name what comes in, before ✨.** Open the panel's **Advanced — ports, model, tools,
images, failures**:

1. Change the input's name from `prompt` to what it holds: `story`. The default says *what
   to ask*, and ✨ Input believes it: given `prompt`, it twice wrote an example that was not a
   story -- first an invented one, then the node's own sentence -- and an example answer to
   match.
2. Tick **Run once per item**. Without it the model is handed the whole list in one call
   and writes one summary of everything.

**Text, a real file, then ✨.** In the top box:

> Summarize one short story: its title, then two sentences -- what it is about, and where
> it ends up.

Press **⟳ From the graph** under *Example files*: it runs what feeds the node — the start
point, sent what the page holds — and attaches the first story. Then **✨ Input**,
**✨ Output**, **✨ Prompt**. An AI node's third file is its instructions, `prompt.md`, not
code. `input.js` now holds the first story's text under `story`, and `output.js` a summary
of it. In the run measured here the three took about 36 s on a small hosted model.

**Run it.** **▶ Run** opens the **App** tab with the folder in the path box, and waits for
you: choosing the folder is what runs it, so press **Enter** in the box (*Press Enter to use
this folder*, it says). Three stories were summarized within ten seconds, one summary under
the other in the text window.

## Where the time goes

**1. The first run on real data.** ✨ writes the code against the *example* in `input.js`.
A CSV with other column names, a decimal comma, or a header on row three runs fine on the
example and fails on your file. Give ✨ Input the real file before pressing ✨ Code — **⟳
From the graph** or **📂 Add a file…** in the panel, or drop one on the node. That one step is
the difference between a first run that works and ten minutes of correcting. The same goes
for what the input is *called*: a node with its default input `prompt` and a wired file
produced a wrong example twice in a row here, before it was named `story`.

**2. Saying it precisely.** A vague text gets a vague node. *Plot the data* writes something;
*bar chart of the population per country, largest first* writes what you meant. When the
result is almost right, change it with one sentence in the bar under the canvas instead of
rewriting the text.

**3. A slow model.** A tool with an AI node asks the model once per run, or once per item.
Twenty files at 10 s each is three minutes of waiting each time you try it. Try on one file.

**4. A model that does not know the shape of your problem.** ✨ with a small model is good at
one node with a clear task. It is weaker at many nodes at once: asked to build a whole tool
from one sentence (*File → ✨ AI Graph…*), the same model returned in about ten seconds a
four-node graph and a warning that one of its AI nodes would run once on everything instead
of once per item. Build from a page and one node, run it, add the next. The whole-graph
generator is for a first sketch.

**5. Words.** The plotter needs six: a page, a start point, an end point, a node, a port, a
wire. A tool that starts on a clock needs a start point that starts itself, and one that
filters a gate (◆); [graphs.md](graphs.md) explains them when a tool gets there.

## When something does not work

- **A node shows an error under its port, or is skipped.** Open it, press **▶ Try**: it runs
  on the example in `input.js`, held to the example in `output.js`. A failing example says
  which of the two is wrong. **✨ Fix** repairs the body from that error.
- **✨ does nothing, or answers with an error.** The model setting: ⚙ Settings → AI shows
  *Now: provider / model*. A key that is missing or a local server that is not running both
  end here.
- **What did it send?** **What ✨ sends** next to each ✨ shows the request word for word.
- **The graph reports a problem before it runs.** The list names the node and what to
  change; it is the same check CI runs on every example.
- **Using the page starts nothing.** No block fires its start point: on the Gui tab, set
  **Using it fires** on the block that should start it. The check names it too: *It is
  started by the page, and nothing on the page fires it.*
- **It runs and the page stays empty.** The block shows an end point nothing is wired into,
  or a wire is on the wrong dot: the end point's card says which blocks show it, and its
  *Value* dot is where the result goes in.

## Next

[`examples/`](../examples/) holds seven tools to open and read, from the plotter to a team of
AI analysts. [graphs.md](graphs.md) is the reference for every node and block;
[deployment.md](deployment.md) for what 🚀 produces.
