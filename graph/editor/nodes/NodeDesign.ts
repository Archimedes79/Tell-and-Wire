// What only building a node asks.
//
// A design is the editor's face of a node: how an AI writes its body, what a
// person writing a graph must know of its settings, what is wrong with it that
// only its kind can say, what a bundle must carry for it, what runs when it
// runs. `check`, `test`, a bundle being made and the editor ask it; a run never
// does. It is not shipped: a tool carries the node's definition
// (`graph/nodes/`) and runner (`backend/deployment/runtime/nodes/`), and
// nothing outside an `editor` folder imports this.
//
// One class per kind extends this one, in `<kind>/<Kind>NodeDesign.ts`, and
// overrides what the kind says differently; `registry.ts` lists them.

import type { GraphNode } from '../../graph.ts';
import type { Kinds, NodeDefinition } from '../../nodes/NodeDefinition.ts';
import type { Problem } from '../../wiring.ts';
import type { Generation } from '../generation.ts';

/** What a deploy bundle must carry for this node to run elsewhere. */
export interface DeployNeeds {
  /** The bundle needs the gui: the graph is used through it, not only from a terminal. */
  needsInterface: boolean;
  /**
   * It calls a model, so whoever receives the bundle needs a provider set up.
   *
   * Asked of the node rather than looked for by node type. A node that
   * holds a graph answers for itself; what is *inside* it is followed by
   * `bundleNeeds`, which walks the graphs.
   */
  asksAi: boolean;
}

/**
 * What runs when a node runs, said for whoever reads its panel or the
 * documentation: the editor shows it at the foot of the node's panel.
 */
export interface WhatRuns {
  /**
   * `graph`: the node's runner, its `execute`, in the process that holds the graph.
   * `body`: a file in the node's own folder, run sandboxed (`backend/deployment/runtime/nodes/body.ts`).
   */
  by: 'graph' | 'body';
  /** The source file and method, or the body's file name in the node's folder. */
  where: string;
  /** One sentence: what it does with what arrives. */
  does: string;
}

/** The designs of the kinds, by type: what a design that looks into another node's kind asks. */
export interface Designs {
  node(type: string): NodeDesign | undefined;
}

export class NodeDesign<K extends NodeDefinition = NodeDefinition> {
  protected readonly kind: K;

  constructor(kind: K) {
    this.kind = kind;
  }

  /**
   * How an AI writes this node's body, or undefined if none does: a code
   * node's code, an ai node's instructions, a data node's data. A start point
   * or an end point holds settings.
   */
  generation(): Generation | undefined {
    return undefined;
  }

  /**
   * What a bundle must carry for this node to run somewhere else.
   *
   * Every body may ask a model (`backend/deployment/runtime/nodes/body.ts`), so every body is looked at, and any
   * mention counts -- `node.llm(`, `{ llm }`, `const ask = node.llm`: a README
   * that explains the model to someone who turns out not to need it costs less
   * than a tool that stops at its first question.
   */
  deployNeeds(node: GraphNode): DeployNeeds {
    const logic = this.kind.logic(node);
    return { needsInterface: false, asksAi: logic !== undefined && /\bllm\b/.test(logic.body) };
  }

  /**
   * What someone writing a graph for this kind must know about its settings:
   * which keys hold what it does, and what goes wrong if they are put anywhere
   * else. A sentence or a paragraph, without a heading -- the prompt that
   * designs a whole graph (`backend/editor/graph/graphPrompt.ts`) collects one from
   * every kind, so a new kind is described in its own file.
   *
   * None means a generated graph is not meant to use this kind, and it is left
   * out of what the model is told exists.
   */
  graphAuthorNote(): string | undefined {
    return undefined;
  }

  /**
   * What runs when this node runs: where that code is, and in one sentence what
   * it does. Every kind says it, so every node's folder and panel can -- the
   * executing class is otherwise nowhere a person building a graph looks.
   */
  whatRuns(_node: GraphNode): WhatRuns {
    // Every kind says more than this.
    return this.graphRuns('');
  }

  /**
   * This kind's runner, its `execute`, named by where the folders put it.
   * Spelled from the node type, never from `constructor.name`: in the
   * editor's bundle a class is called `Kg`.
   */
  protected graphRuns(does: string): WhatRuns {
    const type = this.kind.nodeType;
    const kind = type.charAt(0).toUpperCase() + type.slice(1);
    return { by: 'graph', where: `backend/deployment/runtime/nodes/${type}/${kind}NodeRunner.ts › execute`, does };
  }

  /**
   * What is wrong with this node that only this kind can say.
   *
   * `check` finds what any node can get wrong -- an edge to a port that is not
   * there, a cycle, an interface naming a lost output. What is *this kind of
   * node's* own contract belongs here, in the file that defines it: a node
   * holding a graph knows what may and may not stand at that graph's edge, and
   * the project checker should not have to.
   *
   * Nothing recursive: `check` walks the graphs, this speaks about one node.
   * *wired* is which of its inputs something is wired into: a setting a wire
   * stands in for is no setting missing.
   */
  problems(_node: GraphNode, _kinds: Kinds, _where: string, _wired: ReadonlySet<string> = new Set()): Problem[] {
    return [];
  }

  /**
   * Running this node asks a model: its examples are skipped by an offline
   * `test`.
   *
   * The same question `deployNeeds` answers for a bundle, so it is asked once
   * and read twice. Held apart, they disagreed: `deployNeeds` looks at the
   * body and sees `node.llm(`, this was a constant and said no -- so a bundle
   * told its recipient to configure a provider while `test --offline` ran that
   * same body into a model that was never there.
   */
  asksModel(node: GraphNode): boolean {
    return this.deployNeeds(node).asksAi;
  }

  /**
   * Files and folders this node names as its own defaults: the CSV a picker
   * starts on, the folder a start point reads.
   *
   * A bundle carries them. A tool handed to someone with its default file left
   * behind opens on an error, and the person it was handed to has no way to
   * know which file on someone else's machine it wanted.
   */
  referencedPaths(_node: GraphNode): string[] {
    return [];
  }

  /**
   * What is wrong with this node where the graph above hands its value down
   * to it (`NodeDefinition.answerWith`) -- asked by the node holding the
   * graph, which alone knows that it is held (`SubgraphNodeDesign.problems`).
   * Nothing, by default.
   */
  handedDownProblems(_node: GraphNode, _where: string): Problem[] {
    return [];
  }
}
