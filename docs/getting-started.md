# Getting started

Tell & Wire builds a tool out of a **graph** (what it does) and a **GUI** (what a person sees of it).
These seven steps take you from nothing to a tool you can hand to someone. The rest of this help
is the user guide: the same things, in depth.

1. **Set up an AI.** Open **⚙ Settings** (the gear, top right). Pick where the AI comes from:
   a model on this computer or another one on your network (Ollama, LM Studio, any server that
   speaks the OpenAI API: enter its address), or a cloud model with a key (Google Gemini has a free
   tier). *Now:* under the choice says whether it answers.
2. **Start a tool.** **File → New** gives an empty one. **File → ✨ Describe a graph…** builds one
   from a sentence, for example *Read a text file, summarize it and show the result.* Or open one
   that exists: **File → Open…** and choose a folder from the `examples` folder of this download.
3. **Look at the graph.** A **start point** is where a run begins, an **end point** is where it
   ends, the nodes between them do the work, and a wire carries a result from one to the next.
   Double-click a node to open it: what it does is written on the left, its files are on the right.
4. **Run it.** Press **▶ Run**. The cards show what happens as it happens: a ring turns on the node
   that works, ✓ marks one that is done, ! one that failed. The top bar counts the nodes done.
5. **Shape the GUI.** The **GUI** tab holds the blocks a person uses. **From the graph** draws a
   first page for you; drag in more, click a block to change it.
6. **Save and hand it on.** **Ctrl+S** saves. **File → Deploy as zip** makes the tool a program of
   its own that needs no editor.
7. **If something fails,** the card that failed says so in red, and the word *error* at the top
   opens the **run report**: every node in order, what went wrong in plain words, and a button
   that copies it all, to send to someone who can help.

Everything the editor tells you appears as a card in the top right corner. What went well goes by
itself; a warning or an error stays until you close it.
