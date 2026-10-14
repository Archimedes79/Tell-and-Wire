import { WidgetDesign } from '../WidgetDesign.ts';

export class SliderWidgetDesign extends WidgetDesign {
  override graphAuthorNote(): string {
    return 'min, max, step; it sends the number, and fires when it is let go';
  }
}
