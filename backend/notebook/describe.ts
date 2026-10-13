// Windows from a sentence: a tool said in words, or the windows there are changed as asked.
//
// The model writes the windows (`gui/notebook`), not a graph: a few cells in a short vocabulary
// instead of nodes, ports and wires. What it writes is read as every answer is (`firstBlock`), held to
// `windowProblems`, and sent back once with what is wrong when it does not hold. The graph is made
// from the windows afterwards, the same way for a window a person built by hand.

import type { AiService } from '../../graph/nodes/Runtime.ts';
import { messageOf } from '../../graph/errors.ts';
import { NotWindows, parseWindows } from '../../gui/notebook/read.ts';
import { idOf, windowProblems, windowRows, type Windows } from '../../gui/notebook/windows.ts';
import { GenerationFailed, firstBlock, recording, type AICall, type Target } from '../authoring/ask.ts';

const SYSTEM = `You design tools as a page of windows for a no-code tool. Answer with ONE fenced \`\`\`json block holding the page, then at most two sentences saying what you made. Nothing before the block.

The page is 16 cells wide; a cell is a square. A window takes "span" cells of it (4 to 16; two windows of 8 stand side by side). A window never grows: what comes out fills the room its outputs are given.

A window is a short list of cells, read in this order:
- "inputs": what the person puts in. Each has a "name" (letters, digits, "_" or "-", no spaces: sentences point at it with @Name) and a "kind": "file", "folder" (all the files in it, for a cell that runs "each" file), "text", "number", "choice" (give "options"), or "from" (what another window made: give "from": {"window": id, "output": output name}). Optional: "width" (0.1 to 1, its share of the window's width), "rows", "value" (what it starts with), "extensions" (".txt, .md").
- "trigger": what starts the window. Leave it out for a "Run" button; {"label": "Summarize"} words the button; {"onChange": true} also runs it when an input changes (it costs a model call each time).
- "steps": what is done, in order. Each has a "name" (what @Name later points at: its result), a "sentence" saying what to do and mentioning its inputs with @Name, and "how": "ai" (a model does it; the default) or "code" (a program does it: use for counting, sorting, parsing a table, making the figure a chart shows). A code step also has "code": a JavaScript function "function run(inputs) { ... }" that returns an object with one key for its result, the lower case name with "_" for anything but letters and digits; "inputs" has one key the same way for each thing it takes (a file gives its text, @File.path its path). It must run as written. A chart takes a figure {"kind": "bars"|"columns"|"line"|"donut", "title", "points": [{"label", "value"}]}, drawn to fit; a code step that draws SVG itself (for an "image", or a chart a figure cannot say) is told the room: "function run(inputs, node)" has "node.window", with "shows" (for each output the step feeds: "width" and "height": the pixels to draw in, on a full-width page, smaller on a narrower one, so keep text 14 pixels or more; also "cells" and "rows") and "scheme" (real colour values: "background", "surface", "text", "muted", "accent", "series" for chart series); SVG is shown as a picture, so it takes these colours as values, not CSS variables. A step takes only what its sentence mentions, and the result of the step before when it mentions nothing. "each": true runs it once for every file of a folder it takes. A code step that makes several results lists them in "results".
- "outputs": what comes out. Each has a "name", a "kind": "text", "list" (one entry per item, for a step that runs "each"), "table" (rows), "chart" (a figure to plot), "image" or "chat" (a conversation: the person types in it and the last step's answer is shown in it; a step takes "@Name.message" and "@Name.history" of it, and such a window has no button and no inputs); "rows" (how tall in cells: text 2 to 6, list 3 to 8, table and chart 4 to 8); "width" (its share, 0.1 to 1, so two outputs can stand side by side); "of": the name of the step whose result it shows (the last step's, if left out).

Rules: window ids are lower case letters, digits and "_" ("id"); every window has at least one step and one output; names inside a window are all different, whatever their kind; write the sentences in the language of the request and mean them literally, they are what the model that does the step is told.

Shape:
{"name": str, "description": str, "scheme": "white"|"paper"|"night"|"graphite" (optional; leave it out for white), "windows": [{"id": str, "title": str, "span": int, "inputs": [...], "trigger": {...} (optional), "steps": [...], "outputs": [...]}]}

Example, for "summarize a text file in a length I choose, then say it in English":
{"name": "Summaries", "description": "Summarize a file, then in English.", "windows": [
 {"id": "summarize", "title": "Summarize a file", "span": 8,
  "inputs": [{"name": "File", "kind": "file", "extensions": ".txt, .md", "width": 0.625}, {"name": "Length", "kind": "choice", "options": ["One sentence", "Three sentences", "Five bullet points"], "value": "Three sentences", "width": 0.375}],
  "steps": [{"name": "Summary", "sentence": "Summarize @File in @Length.", "how": "ai"}],
  "outputs": [{"name": "Summary", "kind": "text", "rows": 4}]},
 {"id": "english", "title": "In English", "span": 8,
  "inputs": [{"name": "Summary", "kind": "from", "from": {"window": "summarize", "output": "Summary"}}],
  "steps": [{"name": "English", "sentence": "Say @Summary in English.", "how": "ai"}],
  "outputs": [{"name": "English", "kind": "text", "rows": 3}]}]}`;

/** The ids made valid and different, as a model leaves them: "Summarize it" is not an id. */
function tidy(windows: Windows): Windows {
  const seen = new Set<string>();
  const renamed = new Map<string, string>();
  const made = windows.windows.map((window) => {
    let id = idOf(window.id).replace(/^[^a-z]+/, '') || 'window';
    while (seen.has(id)) id = `${id}_2`;
    seen.add(id);
    renamed.set(window.id, id);
    return { ...window, id };
  });
  return {
    ...windows,
    windows: made.map((window) => ({
      ...window,
      inputs: window.inputs.map((input) => (input.from ? { ...input, from: { ...input.from, window: renamed.get(input.from.window) ?? input.from.window } } : input)),
    })),
  };
}

/** What is wrong with *windows*, in a few lines a model can mend from. */
const wrong = (windows: Windows): string[] => windowProblems(windows).map((one) => `${one.where}: ${one.problem} ${one.fix}`);

/** Read *answer* as windows: its first fenced block, or the whole of it. */
function windowsIn(answer: string): Windows {
  const fenced = firstBlock(answer);
  try {
    return tidy(parseWindows(JSON.parse(fenced ? fenced.code : answer.trim())));
  } catch (error) {
    if (error instanceof NotWindows) throw error;
    throw new NotWindows('The answer was not a page of windows: it could not be read as JSON. It may have been cut off, or the model is too small to write one.');
  }
}

/**
 * Windows designed from *description* -- or, given the windows there are (*current*), those changed as it says,
 * their ids kept. The caller shows the windows; nothing is written here.
 */
export async function describeWindows(
  description: string, deps: { ai: AiService; target: Target; calls?: AICall[] }, current?: Windows,
): Promise<{ windows: Windows; explanation: string; calls: AICall[] }> {
  const calls: AICall[] = deps.calls ?? [];
  const ai = recording(deps.ai, calls);
  const asked = current?.windows.length
    ? `These windows are on the page now:\n${JSON.stringify(current)}\n\nChange them as follows, keeping every id and everything the change does not touch, and answer with the whole page:\n${description}`
    : `Design the page for this tool:\n${description}`;

  const ask = async (prompt: string): Promise<string> => {
    try {
      return await ai.complete({ prompt, system: SYSTEM, ...deps.target });
    } catch (error) {
      throw new GenerationFailed(messageOf(error), calls);
    }
  };
  const read = (answer: string): { windows?: Windows; problems: string[] } => {
    try {
      const windows = windowsIn(answer);
      if (!windows.windows.length) return { problems: ['The page has no windows.'] };
      return { windows, problems: wrong(windows) };
    } catch (error) {
      return { problems: [messageOf(error)] };
    }
  };

  let answer = await ask(asked);
  let result = read(answer);
  // Once more, with what was wrong and the answer it was found in.
  if (result.problems.length) {
    answer = await ask(`${asked}\n\nYour answer was:\n${answer}\n\nIt cannot be used:\n- ${result.problems.join('\n- ')}\nAnswer again with the whole page, mended.`);
    result = read(answer);
  }
  if (!result.windows || result.problems.length) {
    throw new GenerationFailed(`The windows could not be made: ${result.problems.slice(0, 3).join(' ')}`, calls);
  }
  const taller = result.windows.windows.find((window) => windowRows(window) > 40);
  return {
    windows: result.windows,
    explanation: (firstBlock(answer)?.after ?? '') || (taller ? `Window "${taller.title}" is tall.` : ''),
    calls,
  };
}
