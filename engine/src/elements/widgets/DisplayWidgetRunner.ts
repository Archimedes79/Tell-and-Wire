import { WidgetRunner } from '../WidgetRunner.ts';

/**
 * A block that only shows something: a chart, a table, an image -- what the
 * end point it shows hands back. It runs no code of its own: shaping a value
 * into what a block can draw is a code node's work, wired in before the end
 * point.
 */
export abstract class DisplayWidgetRunner extends WidgetRunner {
  override showsEnd(): boolean {
    return true;
  }

  // ── Build time ────────────────────────────────────────────────────────────

  /**
   * What this kind draws, in words: what the node wired into its end point
   * should hand it, and what the block's own dialog says it shows. Lower
   * case, to follow "should be".
   */
  abstract draws(): string;

  /** What the node wired into its end point should hand it: what it draws. */
  override receives(): string {
    return this.draws();
  }

  /** What arrives: said once for the three drawing kinds. */
  override graphAuthorNote(): string {
    return `shows the end point named in "shows", which should be handed ${this.draws()}`;
  }
}
