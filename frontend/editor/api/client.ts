// The editor's end of the wire: the host's routes and the editor's own, called by name.
//
// `deployment/gui/kit/api/client.ts` calls what a host answers; the editor's server answers more
// (`backend/editor/host/api.ts`), and this calls all of it. A graph the server sends back is taken as
// the editor's typed view of the same document (see `document/graph.ts`).
import { API, GUI_API } from '../../../backend/deployment/host/api.ts';
import { EDITOR_API, type AICall } from '../../../backend/editor/host/api.ts';
import { caller, type CallOptions } from '../../deployment/gui/kit/api/client';
import type { RequestOf, ResponseOf } from '../../../backend/deployment/host/api.ts';
import type { FormatGraph, Graph } from '../document/graph';

export { ApiError } from '../../deployment/gui/kit/api/client';
export type { BrowseEntry, BrowsePage, GuiView, Requirement, RoundSnapshot, SessionView, ToolAiSettings } from '../../deployment/gui/kit/api/client';
export type {
  AICall, GenerateRequest, GenerateResponse, McpSaved, McpServerView, McpServersView, ProbeReport, ProviderStatus, SettingsPatch, SettingsStatus,
} from '../../../backend/editor/host/api.ts';

const ROUTES = { ...API, ...GUI_API, ...EDITOR_API };
const send = caller(ROUTES);

/**
 * A response as the editor holds it: a graph the server sends back is taken as
 * the editor's typed view of the same document.
 */
type EditorView<T> =
  T extends FormatGraph ? Graph
    : T extends { graph: FormatGraph } ? Omit<T, 'graph'> & { graph: Graph }
      : T;

/** Call one route of the editor's server. */
export function call<K extends keyof typeof ROUTES & string>(
  name: K,
  request?: RequestOf<(typeof ROUTES)[K]>,
  options?: CallOptions,
): Promise<EditorView<ResponseOf<(typeof ROUTES)[K]>>> {
  return send(name, request, options) as Promise<EditorView<ResponseOf<(typeof ROUTES)[K]>>>;
}

/**
 * Run a generation, and hand *onCalls* what it has sent so far while it runs.
 *
 * A generation is several model calls over a minute or more. Asking every half
 * second what has gone out turns that wait into something a person can read
 * and judge -- the prompt, the context, each step. *run* is handed the id to
 * send as `progress_id`, which is what the server files the calls under. A
 * poll that fails changes nothing: the generation is what matters. A node's
 * panel and ✨ Describe a graph each wrote this out.
 *
 * *stop* ends the watch at once, rejecting with its reason: the request goes
 * on at the server, and what it brings back is dropped -- a call that hung
 * held a node's every ✨ until it ended.
 */
export async function watchGeneration<T>(
  run: (progressId: string) => Promise<T>,
  onCalls: (calls: AICall[]) => void,
  stop?: AbortSignal,
): Promise<T> {
  const progressId = `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // A poll still on its way when the generation ended is not shown: it put
  // the "waiting…" of a finished call into the next generation's live view.
  let done = false;
  const polling = setInterval(async () => {
    try {
      const { calls } = await call('generationProgress', { id: progressId });
      if (calls.length && !done && !stop?.aborted) onCalls(calls);
    } catch {
      // Nothing to do: the next poll, or the generation's own answer, says more.
    }
  }, 500);
  const stopped = new Promise<never>((_, reject) => {
    stop?.addEventListener('abort', () => reject(stop.reason), { once: true });
  });
  try {
    return await Promise.race([run(progressId), stopped]);
  } finally {
    done = true;
    clearInterval(polling);
  }
}

/** Save the deploy bundle the way a browser saves any download, under the name the server gave it. */
export async function downloadBundle(asked: RequestOf<(typeof EDITOR_API)['bundle']>): Promise<void> {
  const zip = await call('bundle', asked);
  const url = URL.createObjectURL(zip);
  const link = document.createElement('a');
  link.href = url;
  link.download = zip.name;
  link.click();
  URL.revokeObjectURL(url);
}
