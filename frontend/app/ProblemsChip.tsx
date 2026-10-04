import { useEffect, useState } from 'react';
import { useGraphStore } from './store/graphStore';
import { problemsOf } from './GraphProblems';
import Button from './ui/Button';
import { PANEL, TEXT, WARNING_TEXT } from './ui/theme';

/**
 * What `check` says of the graph being built, in the bottom bar as "N
 * problems": a cycle, an input nothing feeds, no start point. Hidden while
 * there are none -- and on an empty graph, which has its hint instead. The
 * list opens above the chip. Read a moment after the last change, so that
 * typing a node's text does not ask on every key.
 */
export default function ProblemsChip() {
  const rootGraph = useGraphStore((s) => s.rootGraph);
  const nodes = useGraphStore((s) => s.rfNodes);
  const edges = useGraphStore((s) => s.rfEdges);
  const page = useGraphStore((s) => s.page);
  const metadata = useGraphStore((s) => s.metadata);
  const [problems, setProblems] = useState<ReturnType<typeof problemsOf>>([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setProblems(problemsOf(rootGraph())), 400);
    return () => window.clearTimeout(timer);
  }, [rootGraph, nodes, edges, page, metadata]);

  if (!nodes.length || !problems.length) return null;
  return (
    <div className="relative shrink-0" onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}>
      <Button variant="quiet" size="sm" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span style={{ color: WARNING_TEXT }}>⚠ {problems.length === 1 ? '1 problem' : `${problems.length} problems`}</span>
      </Button>
      {open && (
        <ul
          className="absolute bottom-full right-0 z-10 mb-3 flex max-h-[50vh] w-[min(34rem,80vw)] flex-col gap-2 overflow-y-auto rounded-lg p-3 text-xs"
          style={{ ...PANEL, color: TEXT }}
          aria-label="Problems of this graph"
        >
          {problems.map((problem, index) => (
            <li key={index}>
              <b>{problem.where}</b>: {problem.problem} {problem.fix}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
