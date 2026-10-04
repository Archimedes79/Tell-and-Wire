import { lazy } from 'react';
import type { GraphNode } from '../../../app/graph';
import { DataNodeRunner } from '../../../../graph/nodes/data/DataNodeRunner.ts';
import { NODE } from '../../../app/ui/theme';
import { NodeGuiBuilder } from '../NodeGuiBuilder';
import { describeDataFormat } from './dataFormat';

const DATA = new DataNodeRunner();

/** How much of what a data node holds the nodes wired to it are told, in characters: enough for its keys and a few records. */
const HELD_SHOWN = 600;

export class DataNodeGuiBuilder extends NodeGuiBuilder {
  readonly nodeType = 'data';

  // ── Build time ────────────────────────────────────────────────────────────

  readonly label = 'Data';

  readonly hint = 'Remember a value between runs, so a loop can build on its own last result';

  readonly example = 'e.g. The ten largest capitals, with their population';

  readonly color = NODE.data;

  override readonly paletteGroup = 'Processing';

  // A data node IS the graph's register: it holds its value between runs,
  // which is what lets a feedback edge into it close a cycle. Its panel is that
  // value -- its kind and what it holds -- and ✨ Data, which writes it from the text.
  override readonly Panel = lazy(() => import('./DataNodePanel'));

  override readonly advancedSummary = 'ports';

  // The node reads "input" and hands on "output" by those names.
  override readonly portEditing = { inputs: 'fixed', outputs: 'fixed' } as const;

  override portHint(side: 'inputs' | 'outputs'): string {
    return side === 'inputs'
      ? 'Optional. What arrives here replaces what it holds, and is kept for the next run.'
      : 'What it holds: what arrived last, or the value above until something does.';
  }

  /** A file dropped on it on the canvas is what it holds from now on: what the file says. */
  override dropPort(): 'text' {
    return 'text';
  }

  override withDropped(node: GraphNode, value: unknown): GraphNode {
    return { ...node, config: { ...node.config, data_value: value } };
  }

  /**
   * Its kind, what its text says it holds, and the start of what it holds, as
   * JSON: what the nodes wired to it are told it hands on. The value itself,
   * since its keys are in it: told only "structure: ten capitals", ✨ Input
   * wrote "Capital" where the records say "capital", and the table stayed empty.
   */
  override describeOutput(node: GraphNode): string {
    const said = describeDataFormat(node);
    const value = this.restingValue(node);
    if (value === null || value === undefined) return said;
    const json = JSON.stringify(value) ?? '';
    const start = json.length > HELD_SHOWN ? `${json.slice(0, HELD_SHOWN)}… (${json.length - HELD_SHOWN} more characters)` : json;
    return `${said} -- it holds: ${start}`;
  }

  /** What it remembers, the start of it, under its ports. */
  override canvasSummary(node: GraphNode): string | undefined {
    const value = node.config.data_value;
    if (value === null || value === undefined) return undefined;
    return typeof value === 'string' ? value : JSON.stringify(value);
  }

  /**
   * What it stores is what it hands on, until something new arrives: asked of
   * its runner, which a run asks. An empty text is nothing to hand on.
   */
  override restingValue(node: GraphNode): unknown {
    const handed = DATA.config(node as never).value;
    return handed === '' ? undefined : handed;
  }

  override wantsOn(node: GraphNode): string {
    return `what it stores: ${describeDataFormat(node)}`;
  }

}
