// What the runners make of a node, as the editor's tests compare it.
//
// Beside the page's folders, not in them: a helper for tests, which the layers test has
// no rank for and no page ever imports. vitest only runs `*.test.ts`, so it is
// imported and that is all.
import { registry } from '../../graph/nodes/registry.ts';
import type { GraphNode as FormatNode } from '../../graph/graph.ts';
import type { GraphNode } from '../app/graph';

/** What a run asks a node's element before and while running it. None of them runs anything. */
export const RUN_QUESTIONS = [
  'config', 'batchMode', 'batchConcurrency', 'catchesErrors', 'needsInput',
  'derivedPorts', 'runtimeRequirements', 'referencedPaths', 'logic',
] as const;

/**
 * The node's runner's answer to each question a run asks of *node*, as
 * JSON: two nodes with the same answers are one node to a run. *without*
 * leaves questions out, for a test that compares what they may spell apart.
 */
export function answers(node: GraphNode, without: readonly (typeof RUN_QUESTIONS)[number][] = []): Record<string, string> {
  const element = registry.node(node.node_type) as unknown as Record<string, (node: FormatNode) => unknown>;
  return Object.fromEntries(RUN_QUESTIONS
    .filter((question) => !without.includes(question) && typeof element[question] === 'function')
    .map((question) => [question, JSON.stringify(element[question](node as FormatNode)) ?? 'undefined']));
}
