import { useCallback } from 'react';
import { create } from 'zustand';
import { errorText } from '../../app/api/errorText';
import { ApiError, watchGeneration, type AICall } from '../../app/api/client';
import { useGraphStore } from '../../app/store/graphStore';

/** Said when ✨ was stopped: what it wrote before stays, what was on its way does not come. */
const STOPPED = '⏹ Stopped: what was still on its way is not written.';

interface GenerateOptions<T> {
  /**
   * Return why generation cannot start yet (e.g. "Please add a prompt first."),
   * or nothing to proceed.
   */
  guard?: () => string | undefined;
  /**
   * The API call. It is handed an id it can pass on as `progress_id`, which is
   * what lets the transcript be read while it is still being written.
   */
  run: (progressId?: string) => Promise<T>;
  /** Write the result into the node. */
  apply: (result: T) => void;
  pending?: string;
  /**
   * What to say when it worked. A function when the result itself decides --
   * generated code that was verified against real data has more to report than
   * "done".
   */
  success: string | ((result: T) => string);
  failure?: string;
  /** Told the calls of a generation that failed, which are worth keeping as much as those of one that worked. */
  failed?: (calls: AICall[]) => void;
}

/** What one node's ✨ is doing, and what it last said and sent. */
interface Writing {
  busy: boolean;
  message: string;
  /** What the last generation actually sent and got back. */
  transcript: AICall[];
  /** The same thing while it is still happening, so the wait is not a blank box. */
  live: AICall[];
}

const IDLE: Writing = { busy: false, message: '', transcript: [], live: [] };

/**
 * Where each node's ✨ stands, outside the panel: closing the panel -- or
 * opening another node's -- does not stop a generation, and the node's card
 * says it is still writing (`useIsWriting`). A panel opened again finds what
 * was said. Kept by the open document and the node's id: ids repeat from
 * graph to graph.
 */
const useWriting = create<Record<string, Writing>>(() => ({}));
/** How the generation in flight, per node, is stopped. */
const inFlight = new Map<string, AbortController>();

const keyOf = (document: number, nodeId: string): string => `${document}:${nodeId}`;

const say = (key: string, change: Partial<Writing>): void =>
  useWriting.setState((all) => ({ [key]: { ...(all[key] ?? IDLE), ...change } }));

/** Whether ✨ is writing for node *nodeId* of the open graph. */
export function useIsWriting(nodeId: string): boolean {
  const key = useGraphStore((s) => keyOf(s.document, nodeId));
  return useWriting((s) => s[key]?.busy ?? false);
}

/**
 * The ✨ buttons' state machine, once -- of node *nodeId*.
 *
 * Seven handlers across three files repeated the identical seven steps --
 * guard, set busy, set "Generating…", await, apply, set "✅", catch and format
 * the error, clear busy -- differing only in the four things `GenerateOptions`
 * names. They also each spelled the axios error extraction slightly
 * differently, so the same backend failure read differently depending on which
 * button you pressed.
 *
 * What comes back is written in at once, as one undo step: Undo is how it is
 * taken back, as for anything else changed in a node's panel. It used to wait
 * for Accept or Discard -- a click after every ✨, with the result on screen
 * but not in the node, so nothing could try it. The exchange that produced it
 * stays on screen either way (`GenerationTranscript`).
 */
export function useGenerate(nodeId: string) {
  const key = useGraphStore((s) => keyOf(s.document, nodeId));
  const now = useWriting((s) => s[key]) ?? IDLE;

  /** Generate, and write what comes back. Resolves to whether it was written. */
  const run = useCallback(async <T,>(options: GenerateOptions<T>): Promise<boolean> => {
    const blocked = options.guard?.();
    if (blocked) {
      say(key, { message: `❌ ${blocked}` });
      return false;
    }
    const stopping = new AbortController();
    inFlight.set(key, stopping);
    // What has gone out so far, while it runs: a wrong answer can then be
    // understood rather than only re-rolled.
    say(key, { busy: true, message: options.pending ?? 'Generating…', live: [] });
    try {
      const result = await watchGeneration(options.run, (live) => say(key, { live }), stopping.signal);
      // Kept whether or not it worked out: a transcript is opened when
      // something went wrong, so the failing case is the one that needs it.
      const calls = (result as { calls?: AICall[] })?.calls;
      if (calls) say(key, { transcript: calls });
      options.apply(result);
      say(key, { message: typeof options.success === 'function' ? options.success(result) : options.success });
      return true;
    } catch (error) {
      if (stopping.signal.aborted) {
        say(key, { message: STOPPED });
        return false;
      }
      const calls = error instanceof ApiError ? error.body.calls : undefined;
      if (calls) say(key, { transcript: calls });
      if (calls?.length) options.failed?.(calls);
      say(key, { message: `❌ ${errorText(error, options.failure ?? 'Generation failed')}` });
      return false;
    } finally {
      inFlight.delete(key);
      say(key, { busy: false, live: [] });
    }
  }, [key]);

  /**
   * Stop waiting for the generation in flight, as the bar's Stop does a change
   * of the graph: nothing more is waited for, and what it still brings back is
   * dropped -- the request goes on at the server. A call that hung held every
   * ✨ and ▶ Try of the node with it.
   */
  const stop = useCallback(() => inFlight.get(key)?.abort(), [key]);

  return { ...now, run, stop };
}
