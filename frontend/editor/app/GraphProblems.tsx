import { useMemo } from 'react';
import type { Graph } from '../document/graph';
import { parseGraph } from '../../../graph/graph.ts';
import type { Problem } from '../../../graph/wiring.ts';
import { problemsIn } from '../../../gui/editor/check.ts';
import { TEXT, WARNING_FILL, WARNING_TEXT } from '../../deployment/gui/kit/ui/theme';
import { messageOf } from '../../../graph/errors.ts';

/** What `check` says of *graph*: its problems -- or, when it cannot be read as one, that. */
export function problemsOf(graph: Graph): Problem[] {
  try {
    return problemsIn(parseGraph(graph));
  } catch (error) {
    return [{ where: 'graph', problem: messageOf(error), fix: 'Fix the graph so it can be read.' }];
  }
}

/** Where a problem is, as the person sees it: `node "code"` becomes the name on its card, “Code 1”. */
export function placeOf(where: string, graph: Pick<Graph, 'nodes'>): string {
  return where.replace(/node "([^"]+)"/g, (whole, id: string) => {
    const label = graph.nodes.find((node) => node.id === id)?.label;
    return label ? `“${label}”` : whole;
  });
}

/**
 * What `check` finds in a graph about to be taken in from outside -- one ✨ Describe
 * a graph designed or changed, one pasted as JSON -- said before the button
 * that takes it (*action*: Load, Apply). Loaded without a word, a graph whose
 * button fired a start point it lacked started nothing, and nothing said why.
 */
export default function GraphProblems({ graph, action = 'Load' }: { graph: Graph; action?: string }) {
  const problems = useMemo(() => problemsOf(graph), [graph]);
  if (!problems.length) return null;
  return (
    <div className="text-xs px-3 py-2 rounded space-y-1" style={{ background: WARNING_FILL, color: WARNING_TEXT }} role="status">
      <p className="font-medium">
        ⚠ {problems.length === 1 ? 'This graph has a problem' : `This graph has ${problems.length} problems`}. {action} takes it as it is.
      </p>
      <ul className="space-y-1">
        {problems.map((problem, index) => (
          <li key={index}>
            <span style={{ color: TEXT }}>{placeOf(problem.where, graph)}</span>: {problem.problem} {problem.fix}
          </li>
        ))}
      </ul>
    </div>
  );
}
