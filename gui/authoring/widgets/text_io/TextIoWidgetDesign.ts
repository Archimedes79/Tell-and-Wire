import { WidgetDesign } from '../WidgetDesign.ts';

export class TextIoWidgetDesign extends WidgetDesign {
  override graphAuthorNote(): string {
    return 'mode input (typed into: it sends the text, and Enter fires), output (shows its end point) or both '
      + '(typed into and showing), which is what a block without a mode is';
  }
}
