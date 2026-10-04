/**
 * What an element's browser half must agree with its runner on.
 *
 * Walks every registered `NodeGuiBuilder` (`registry.ts`). That a panel is loaded only when
 * opened is held by `gui-editor/runtime/boundary.test.ts`; what an element does when a graph
 * runs is the runner's to test, beside the element (`graph/nodes/`).
 */
import { describe, it, expect } from 'vitest';
import { NODE_KINDS } from '../document/nodeKinds';
import { NODE_BUILDERS } from './registry';
import type { GraphNode } from '../graph';
import { hasDefinitions } from '../../graph-editor/authoring/generation';

describe('node elements', () => {
  it('define themselves exactly where their runner keeps its definitions', () => {
    for (const [nodeType, element] of Object.entries(NODE_BUILDERS)) {
      const node = NODE_KINDS[nodeType as GraphNode['node_type']].create(`${nodeType}-gen`);
      // Its ports in Advanced, its input.js and output.js in its panel: the side panel's answer and the runner's are one.
      expect(element.definesItself, nodeType).toBe(hasDefinitions(node));
    }
  });
});
