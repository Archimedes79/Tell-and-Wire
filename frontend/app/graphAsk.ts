// Asking ✨ to design a graph, or to change the one open: the one request the
// File menu's "Describe a graph" and the bar under the canvas both make, with
// the same steps -- asked, back, or failed -- and one place that holds them.

import { useCallback, useRef, useState } from 'react';
import type { Graph } from './graph';
import { ApiError, call, watchGeneration, type AICall } from './api/client';
import { errorText } from './api/errorText';
import { lastAsked } from './lastAsked';

/** Where a request stands. *sent*: the graph it was asked about, to tell whether it changed since. */
export type GraphAsk =
  | { phase: 'idle' }
  | { phase: 'asking'; said: string; calls: AICall[] }
  | { phase: 'ready'; said: string; graph: Graph; explanation: string; sent: string }
  | { phase: 'failed'; said: string; error: string; calls: AICall[] };

/**
 * One request at a time. `send` asks for *description* -- about *graph* when
 * one is given, else a new graph -- and `reset` forgets it, one still on its
 * way included: only the last request asked is still wanted.
 */
export function useGraphAsk() {
  const [ask, setAsk] = useState<GraphAsk>({ phase: 'idle' });
  const asked = useRef(lastAsked());

  /** Ask; how it came out -- 'ready' or 'failed' -- or null when it was no longer wanted by then. */
  const send = async (said: string, description: string, graph?: Graph): Promise<'ready' | 'failed' | null> => {
    const wanted = asked.current.ask();
    setAsk({ phase: 'asking', said, calls: [] });
    try {
      const result = await watchGeneration(
        (progressId) => call('generateGraph', { description, ...(graph ? { graph } : {}), progress_id: progressId }),
        (calls) => { if (wanted()) setAsk((now) => (now.phase === 'asking' ? { ...now, calls } : now)); },
      );
      if (!wanted()) return null;
      setAsk({ phase: 'ready', said, graph: result.graph, explanation: result.explanation, sent: JSON.stringify(graph ?? null) });
      return 'ready';
    } catch (error) {
      if (!wanted()) return null;
      // The whole failing exchange, replies included, as a node's ✨ keeps it: the failing case is the one where what was asked matters.
      setAsk({ phase: 'failed', said, error: errorText(error, 'The graph could not be made.'), calls: error instanceof ApiError && error.body.calls ? error.body.calls : [] });
      return 'failed';
    }
  };

  const reset = useCallback(() => {
    asked.current.cancel();
    setAsk({ phase: 'idle' });
  }, []);

  return { ask, send, reset };
}
