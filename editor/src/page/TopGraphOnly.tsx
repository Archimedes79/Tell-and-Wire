import type { ReactNode } from 'react';
import { useGraphStore } from '@/store/graphStore';
import { DIMMER, MUTED, NEUTRAL_BUTTON, SUNKEN } from '@/ui/theme';

/**
 * A view of the page, shown only where a page can be: in the graph at the top.
 *
 * Inside a node's graph the canvas shows that graph, but the page is not
 * there: a page put inside a subgraph is one `check` rejects and nobody sees,
 * and a colour scheme written there is read by nothing. So in there the page
 * views say where the page is, and take you back up to it.
 */
export default function TopGraphOnly({ children }: { children: ReactNode }) {
  const inside = useGraphStore((s) => s.subgraphStack.length > 0);
  const closeSubgraphsTo = useGraphStore((s) => s.closeSubgraphsTo);
  // No level changes while a run is in flight -- its result would land on the
  // canvas of another graph (`openSubgraph`) -- so the way up waits for it. A
  // button that then did nothing, without a word, would look broken.
  const running = useGraphStore((s) => s.isExecuting);
  if (!inside) return <>{children}</>;

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 px-8" style={{ background: SUNKEN }}>
      <p className="text-sm" style={{ color: MUTED }}>
        The page belongs to the graph at the top.
      </p>
      <p className="text-xs text-center max-w-md" style={{ color: DIMMER }}>
        You are inside a node's graph, which runs as one part of the graph above it and has no page of its own.
        Go back up to build the page or try it.
      </p>
      <button
        className="mt-2 text-xs px-3 py-1.5 rounded-lg"
        style={{ ...NEUTRAL_BUTTON, opacity: running ? 0.5 : 1 }}
        disabled={running}
        onClick={() => closeSubgraphsTo(0)}
      >
        ↑ Back to the graph at the top
      </button>
      {running && (
        <p className="text-xs" style={{ color: DIMMER }}>
          A run is going on. The way up opens when it is over.
        </p>
      )}
    </div>
  );
}
