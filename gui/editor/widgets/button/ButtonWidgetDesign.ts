import { WidgetDesign } from '../WidgetDesign.ts';

export class ButtonWidgetDesign extends WidgetDesign {
  override graphAuthorNote(): string {
    return 'fires the start point named in "fires" when pressed; it sends nothing itself';
  }
}
