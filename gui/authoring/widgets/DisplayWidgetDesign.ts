import { WidgetDesign } from './WidgetDesign.ts';

/** The design of a block that only shows (`DisplayWidgetDefinition`): what it takes is what it draws. */
export abstract class DisplayWidgetDesign extends WidgetDesign {
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
