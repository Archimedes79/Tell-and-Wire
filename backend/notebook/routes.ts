// The routes of the notebook: open and save a project made of windows, and make windows from a sentence.
//
// Rows of `NOTEBOOK_API` (`api.ts`), answered by the notebook's own server (`main.ts`), beside the routes of a run that every server
// has. What they do is done elsewhere: the windows and what they make by `gui/notebook`, their file by `files.ts`, the words to a
// model by `describe.ts`, and the project by the layers every other save goes through (`backend/authoring`).

import { resolve } from 'node:path';
import { NotAGraph, NotFound, messageOf } from '../../graph/errors.ts';
import { parseGraph, type Graph } from '../../graph/graph.ts';
import { problemsIn } from '../../gui/editor/check.ts';
import { withoutWriting } from '../../graph/editor/handedOn.ts';
import { parseWindows } from '../../gui/notebook/read.ts';
import { windowProblems, windowsToGraph, type Windows } from '../../gui/notebook/windows.ts';
import { expandHome } from '../deployment/host/browse.ts';
import { Refusal, type HandlersOf } from '../deployment/host/http.ts';
import * as project from '../deployment/project/folder.ts';
import { GenerationFailed, GenerationRefused, type AICall, type Target } from '../authoring/ask.ts';
import type { AiService } from '../../graph/nodes/Runtime.ts';
import { NOTEBOOK_API, type WindowsFile } from './api.ts';
import * as write from '../authoring/write.ts';
import { nodeRuntime } from '../deployment/runtime/services.ts';
import { aiSetting } from '../deployment/runtime/ai/settings.ts';
import { holderOf, type SessionHolder } from '../deployment/host/session.ts';
import { describeWindows } from './describe.ts';
import { readKept, signatureOf, writeKept } from './files.ts';

/** What the routes need of the server that answers them. */
export interface WindowsDeps {
  /** Run *work* with a transcript of the calls it makes, kept on a failure: the words the page reads, with the calls that led to them. */
  watched: <T>(work: (calls: AICall[]) => Promise<T>) => Promise<T>;
  ai: () => AiService;
  target: () => Promise<Target>;
}

/** The project layer's refusals as the statuses the page reads. */
async function onProject<T>(action: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof Refusal) throw error;
    if (error instanceof NotFound) throw new Refusal(404, error.message);
    if (error instanceof NotAGraph) throw new Refusal(400, error.message);
    if (error instanceof project.FileChanged) throw new Refusal(409, error.message);
    throw new Refusal(400, `Could not ${action}: ${messageOf(error)}`);
  }
}

/**
 * Whether the graph on disk is no longer what the windows made: it is neither what they were saved with nor what they make today.
 * The second reading is for a project saved by another version, whose files this version would make a little differently
 * (a scheme named another way, a block with one more key): nobody changed anything, so saving it loses nothing.
 */
function changedOutside(kept: { windows: Windows; signature: string }, graph: Graph): boolean {
  const now = signatureOf(graph);
  return kept.signature !== now && signatureOf(windowsToGraph(kept.windows, graph)) !== now;
}

/** The project at *full*, with the windows kept in it and whether the graph beside them is still what they made. */
async function opened(full: string): Promise<WindowsFile> {
  const graph = await project.loadGraph(full);
  const folder = project.projectFolderOf(full);
  const kept = folder ? await readKept(folder) : null;
  return {
    path: folder ?? full, project: folder !== null, graph: graph as never,
    windows: kept?.windows ?? null,
    stale: !!kept && changedOutside(kept, graph),
  };
}

export function windowsRoutes(deps: WindowsDeps) {
  return {
    openWindows: (asked: { path: string }): Promise<WindowsFile> => {
      if (!asked.path) throw new Refusal(400, "Missing required field 'path'");
      return onProject('open the notebook', () => opened(resolve(expandHome(asked.path))));
    },

    saveWindows: (asked: { path: string; windows: unknown; replace?: boolean }): Promise<WindowsFile> => {
      if (!asked.path) throw new Refusal(400, "Missing required field 'path'");
      return onProject('save the notebook', async () => {
        const full = resolve(expandHome(asked.path));
        if (full.toLowerCase().endsWith('.json')) throw new Refusal(400, 'A notebook is a project folder: give a folder, not a file.');
        const windows = parseWindows(asked.windows);
        const found = windowProblems(windows);
        if (found.length) throw new Refusal(422, `The windows cannot be made into a tool: ${found.slice(0, 3).map((one) => `${one.where}: ${one.problem}`).join(' ')}`);
        const there = write.graphAt(full);
        // What is there is written over only when told, as every save is (a notebook of the same name is the same project).
        if (there && !asked.replace) {
          throw new Refusal(409, `${project.projectFolderOf(there) ? 'A project' : 'A graph file'} is already at ${there}. Replace it, or save under another name.`, { taken: true });
        }
        const before: Graph | undefined = there ? await project.loadGraph(there).catch(() => undefined) : undefined;
        const graph = windowsToGraph(windows, before);
        const unfit = problemsIn(graph);
        if (unfit.length) throw new Refusal(422, `The windows make a graph that cannot run: ${unfit.slice(0, 3).map((one) => `${one.where}: ${one.problem}`).join(' ')}`);
        await write.saveGraph(full, parseGraph(graph));
        // The signature of what is on disk, read back: the same reading `openWindows` makes.
        const folder = project.projectFolderOf(full) ?? full;
        await writeKept(folder, { windows, signature: signatureOf(await project.loadGraph(folder)) });
        return opened(folder);
      });
    },

    describeWindows: (asked: { description?: string; windows?: unknown }) => deps.watched(async (calls) => {
      const description = (asked.description ?? '').trim();
      if (!description) throw new GenerationRefused('Say what the tool should do.');
      const current = asked.windows ? parseWindows(asked.windows) : undefined;
      try {
        const { windows, explanation } = await describeWindows(description, { ai: deps.ai(), target: await deps.target(), calls }, current);
        return { windows, explanation };
      } catch (error) {
        if (error instanceof GenerationFailed || error instanceof GenerationRefused) throw error;
        throw new GenerationFailed(messageOf(error), calls);
      }
    }),
  };
}

/** Run *work* with a transcript of the calls it makes; a writing that failed is a 500 with the calls that led to it, one refused a 400. */
async function watched<T>(work: (calls: AICall[]) => Promise<T>): Promise<T> {
  const calls: AICall[] = [];
  try {
    return await work(calls);
  } catch (error) {
    if (error instanceof GenerationRefused) throw new Refusal(400, error.message);
    // The failing generation is the one whose transcript is worth reading.
    throw new Refusal(500, messageOf(error), { calls: error instanceof GenerationFailed ? error.calls : calls });
  }
}

/**
 * Everything the notebook's server answers of its own: the windows' routes, and the hand-over of the page being made to the
 * server's session -- what every round runs, whoever starts it.
 *
 * @param held the session this server holds, and how a graph is handed to it. The notebook's own server starts with none; the page hands one over.
 */
export function notebookRoutes(held: SessionHolder = holderOf()): HandlersOf<typeof NOTEBOOK_API> {
  return {
    ...windowsRoutes({ watched, ai: () => nodeRuntime().ai, target: () => aiSetting(process.cwd(), process.env, 'write') }),

    async holdGraph(asked) {
      const session = await held.hold(withoutWriting(parseGraph(asked.graph)), { path: asked.path, session: asked.session });
      return { session: session.id, dropped: session.dropped };
    },
  };
}

/** The notebook as a part of a server (`serve`): the page it serves, the routes it adds, and what answers them. */
export function notebookPart(dist: string) {
  return { dist, api: NOTEBOOK_API, handlers: notebookRoutes };
}
