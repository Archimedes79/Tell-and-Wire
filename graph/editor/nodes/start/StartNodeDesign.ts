import { NodeDesign, type DeployNeeds, type WhatRuns } from '../NodeDesign.ts';
import { isStruct, type GraphNode } from '../../../graph.ts';
import type { Kinds } from '../../../nodes/NodeDefinition.ts';
import { names, type Problem } from '../../../wiring.ts';
import { RUN_PORT, START_PORT, parseInterval } from '../../../triggers.ts';
import { ownPathProblem } from '../../../nodes/ownPath.ts';
import type { StartNodeDefinition } from '../../../nodes/start/StartNodeDefinition.ts';

export class StartNodeDesign extends NodeDesign<StartNodeDefinition> {
  override graphAuthorNote(): string {
    return `a named start point: where a round begins. Its id is its name; whoever uses the graph starts it by that name. `
      + `config.started_by is "gui" (a block on the gui fires it: then the graph needs a gui), "call" (a script, a model over MCP, or the graph above starts it) `
      + `or "itself" (config.on_start, true or false: when the tool starts; config.every, "" or "30s", "5m", "2h", "1d": again on that clock; `
      + `config.reads, "file" or "folder", with config.path: it then sends that file -- {path, content} -- or the paths of the files in that folder -- config.extensions, e.g. ".csv, .txt", `
      + `keeps only those types, config.recursive = true looks into subfolders too -- as "values" under its own id, read afresh each time it starts). `
      + `Its one output, "${START_PORT}", is DERIVED, not taken from this document: one package {"event": {"name", "by"} or null, "values": {...}}. `
      + `"values" is whatever the sender sent, under the sender's names. Wire "${START_PORT}" into the input of each node that works on it -- an input that takes one value of it says which with `
      + `"field": "<name>" (or a path inside it, "file.content") and is handed that value alone; one without a field is handed the whole package -- or into a node's "${RUN_PORT}" to start that node. `
      + `"event" is null in a round this start point did not begin: "values" are then what it was sent last.`;
  }

  /** A start point the gui starts makes a graph one that is used through its gui: a package carries the gui. */
  override deployNeeds(node: GraphNode): DeployNeeds {
    return { needsInterface: this.kind.config(node).startedBy === 'gui', asksAi: false };
  }

  override whatRuns(): WhatRuns {
    return this.graphRuns('Hands on one package: the event, when this round began here, and the values it was sent -- the last ones, in a round it did not begin -- or, set to read a file or a folder, what is there now.');
  }

  /** What it reads, named by its path: a package carries it, so the tool opens on it elsewhere. */
  override referencedPaths(node: GraphNode): string[] {
    const { reads, path } = this.kind.config(node);
    return reads && path ? [path] : [];
  }

  override problems(node: GraphNode, _kinds: Kinds, where: string): Problem[] {
    const { startedBy, onStart, every, reads, path } = this.kind.config(node);
    if (startedBy !== 'itself') return [];
    const found: Problem[] = [];
    if (reads && !path) {
      found.push({ where, problem: `This start point is set to read ${reads === 'folder' ? 'a folder' : 'a file'}, and no path says which.`, fix: 'Choose it in the start point, or set it to send nothing.' });
    }
    const outside = reads && path ? ownPathProblem(path) : null;
    if (outside) found.push({ where, problem: outside, fix: "Put what it reads in the tool's folder and write the path relative to it." });
    if (every) {
      try {
        parseInterval(every);
      } catch (error) {
        found.push({ where, problem: error instanceof Error ? error.message : String(error), fix: 'Write the interval as 45, 30s, 5m, 2h or 1d.' });
        return found;
      }
    }
    if (!onStart && !every) {
      found.push({ where, problem: 'This start point never starts: it starts itself, but neither when the tool starts nor on a clock.', fix: 'Tick "when the tool starts", give it an interval, or let the gui or a call start it.' });
    }
    return found;
  }

  /**
   * What a call sends it for example, held to what the graph above sends: the
   * value under this start point's id (`NodeDefinition.answerWith`). An example keyed
   * otherwise is what a run of it on its own, and every node written against
   * it, reads -- and the graph above sends none of it: a run from up there
   * handed the inputs nothing, and said nothing.
   */
  override handedDownProblems(node: GraphNode, where: string): Problem[] {
    const { startedBy, values } = this.kind.config(node);
    if (startedBy !== 'call' || !isStruct(values)) return [];
    const keys = Object.keys(values);
    if (!keys.length || keys.includes(node.id)) return [];
    return [{
      where,
      problem: `The graph above sends it its value under "${node.id}", and what a call sends it for example holds ${names(keys)}: `
        + 'an input that takes one of those is handed nothing when the graph above runs this one.',
      fix: `Write the example under "${node.id}" -- {"${node.id}": …} -- and let the inputs wired from it take "${node.id}".`,
    }];
  }
}
