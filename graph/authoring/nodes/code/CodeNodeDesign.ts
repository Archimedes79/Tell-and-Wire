import { NodeDesign, type WhatRuns } from '../NodeDesign.ts';
import type { GraphNode } from '../../../graph.ts';
import type { Problem } from '../../../wiring.ts';
import type { Generation } from '../../generation.ts';
import { CODE_FIELDS, asideFiles, type CodeNodeDefinition } from '../../../nodes/code/CodeNodeDefinition.ts';
import { JAVASCRIPT } from './javascript.ts';

export class CodeNodeDesign extends NodeDesign<CodeNodeDefinition> {
  override graphAuthorNote(): string {
    return 'its description says in words what it does, and config.code holds it as JavaScript: "function run(inputs) { ... }", '
      + 'returning an object whose keys are exactly this node\'s output port ids. Use only what Node has built in; there is no '
      + 'package manager -- but files beside code.js can be loaded: config["file:tax.js"] holds a file tax.js (.js, .mjs, .cjs, .json, .csv or .txt) '
      + 'that code.js loads with require("./tax.js"). The function may be async and is handed a second argument, node: "await node.llm({ prompt: \'...\' })" '
      + 'asks the configured model a question and resolves to its answer as text -- use it when code has to decide what to ask, '
      + 'or ask in a loop; for one question, use an ai node instead. node.windows lists the blocks of the GUI that show what '
      + 'the node hands on, each { port, block, kind, label, w, h, width, height } (cells, and pixels at most): code that draws can use it. config.input_definition and config.output_definition may '
      + 'say what one call is handed and returns, each as a JSDoc typedef followed by "module.exports = <one example as plain JSON>;".';
  }

  override whatRuns(): WhatRuns {
    return { by: 'body', where: 'code.js', does: 'Calls run(inputs, node) in code.js, sandboxed, and hands on the object it returns, keyed by output port.' };
  }

  override problems(node: GraphNode, _kinds: unknown, where: string): Problem[] {
    const code = String(node.config.code ?? '');
    if (!code.trim()) {
      // Said as a person meets it -- the file -- and the field only where a graph file is what is read.
      return [{
        where,
        problem: 'Its code.js holds no code yet: it fails the moment it runs.',
        fix: 'Press Auto generate in the node, or write function run(inputs) { … } in code.js (config.code in a graph file), returning an object keyed by its outputs.',
      }];
    }
    // A file it loads from beside it, and is not there: it fails at the line that loads it. input_example.js and output.js are
    // named in code.js's own JSDoc, as types, and are none of this.
    const held = asideFiles(node.config);
    const missing = [...new Set([...code.matchAll(/(?:require\(\s*|\bfrom\s+|\bimport\s*\(?\s*)['"]\.\/([\w.-]+)['"]/g)].map((found) => found[1]))]
      .filter((name) => !['input_example.js', 'output.js', 'code.js'].includes(name) && !(name in held) && !(`${name}.js` in held) && !(`${name}.json` in held));
    return missing.map((name) => ({
      where,
      problem: `Its code loads ./${name}, and no such file stands beside code.js.`,
      fix: `Add ${name} to the node's folder (config["file:${name}"] in a graph file), or load something else.`,
    }));
  }

  /**
   * Written against the node's own ports and definitions.
   *
   * No contract of its own: what a chart must be handed -- the data to plot,
   * never a drawing -- is the chart's to say (`WidgetDesign.receives`), so
   * only a node that is wired into one hears it.
   */
  override generation(): Generation {
    return { kind: 'code', fields: CODE_FIELDS, language: JAVASCRIPT };
  }
}
