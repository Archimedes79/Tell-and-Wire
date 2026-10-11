// The routes of the notebook: open and save a project made of windows, and make windows from a sentence.
//
// Rows of `EDITOR_API` (`../host/api.ts`), handed to `editorRoutes` to answer beside the rest. What they
// do is done elsewhere: the windows and what they make by `gui/editor/windows`, their file by `files.ts`,
// the words to a model by `describe.ts`, and the project by the layers every other save goes through.

import { resolve } from 'node:path';
import { NotAGraph, NotFound, messageOf } from '../../../graph/errors.ts';
import { parseGraph, type Graph } from '../../../graph/graph.ts';
import { problemsIn } from '../../../gui/editor/check.ts';
import { parseWindows } from '../../../gui/editor/windows/read.ts';
import { windowProblems, windowsToGraph } from '../../../gui/editor/windows/windows.ts';
import { expandHome } from '../../deployment/host/browse.ts';
import { Refusal } from '../../deployment/host/http.ts';
import * as project from '../../deployment/project/folder.ts';
import { GenerationFailed, GenerationRefused } from '../graph/generate.ts';
import type { AiService } from '../../../graph/nodes/Runtime.ts';
import type { AICall, Target, WindowsFile } from '../host/api.ts';
import * as write from '../project/write.ts';
import { describeWindows } from './describe.ts';
import { readKept, signatureOf, writeKept } from './files.ts';

/** What the routes need of the server that answers them: the editor's own, in `editorRoutes`. */
export interface WindowsDeps {
  /** Run *work* with a transcript the page can watch under *id* (`editorRoutes`'s `watched`). */
  watched: <T>(id: string | undefined, work: (calls: AICall[]) => Promise<T>) => Promise<T>;
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

/** The project at *full*, with the windows kept in it and whether the graph beside them is still what they made. */
async function opened(full: string): Promise<WindowsFile> {
  const graph = await project.loadGraph(full);
  const folder = project.projectFolderOf(full);
  const kept = folder ? await readKept(folder) : null;
  return {
    path: folder ?? full, project: folder !== null, graph: graph as never,
    windows: kept?.windows ?? null,
    stale: !!kept && kept.signature !== signatureOf(graph),
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

    describeWindows: (asked: { description?: string; windows?: unknown; progress_id?: string }) => deps.watched(asked.progress_id, async (calls) => {
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
