import { NodeDefinition, type Offer } from '../NodeDefinition.ts';
import type { GraphNode, NodeResult, Port } from '../../graph.ts';

/**
 * The input that says *where* to write rather than *what*: a control input,
 * and the one port of an end point that is not part of its value.
 */
export const WRITE_PATH_PORT = 'path';

interface EndConfig {
  /** Where to write, when writing at all -- unless a path arrives on its `path` input. */
  path: string;
  mode: 'none' | 'file' | 'directory';
}

/**
 * Where a round ends: a named end point, and what the graph hands back --
 * everything wired into it, under its name -- and, if asked, a file or a
 * folder of it too. A GUI shows it by that name, a script reads it, and the
 * graph above has it on the port of the node that holds this graph.
 *
 * A passthrough, deliberately — it echoes its inputs so the run's result says
 * what arrived, rather than inventing a shape of its own. It does not *show*
 * anything either: showing is what the GUI is for, and a window of its own
 * would be a second place where results appear, with no relation to the GUI.
 * Its label is its one name in the result.
 */
export class EndNodeDefinition extends NodeDefinition<EndConfig> {
  readonly nodeType = 'end' as const;

  config(node: GraphNode): EndConfig {
    const c = node.config;
    const mode = String(c.write_mode ?? 'none');
    return {
      path: String(c.path ?? ''),
      mode: (['none', 'file', 'directory'].includes(mode) ? mode : 'none') as EndConfig['mode'],
    };
  }

  /** Everything a graph produces leaves through one of these. */
  override readonly isResult = true;

  /** What it is called on the canvas is what its value is called in the run's result: its label, or its id without one. */
  override resultLabel(node: GraphNode): string {
    return String(node.label ?? '').trim() || node.id;
  }

  override boundaryRole(): 'out' {
    return 'out';
  }

  override valuePorts(node: GraphNode): Port[] {
    return node.inputs.filter((port) => port.id !== WRITE_PATH_PORT);
  }

  /**
   * An output under its own id: what is wired into it. Where it writes is its
   * own setting, or the path wired into it -- from a start point's package,
   * when whoever uses the graph says where.
   */
  override offers(node: GraphNode): Offer[] {
    const carried = this.valuePorts(node);
    return [{
      kind: 'output', name: node.id, label: this.resultLabel(node), type: carried.length === 1 ? carried[0].data_type : 'any',
      ...(carried.length === 1 && carried[0].multi ? { list: true } : {}),
      ...(node.description ? { description: node.description } : {}),
    }];
  }

  /** What arrived: the one thing wired into it, or each of several by its port. */
  override shows(node: GraphNode, result: NodeResult): unknown {
    const carried = this.valuePorts(node);
    if (carried.length === 1) return result.inputs[carried[0].id] ?? null;
    return Object.fromEntries(carried.map((port) => [port.id, result.inputs[port.id] ?? null]));
  }
}
