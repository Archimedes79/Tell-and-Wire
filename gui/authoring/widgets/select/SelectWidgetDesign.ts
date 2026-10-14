import { WidgetDesign } from '../WidgetDesign.ts';

export class SelectWidgetDesign extends WidgetDesign {
  override graphAuthorNote(): string {
    return 'options = one per line; it sends the choice, and fires on a choice made';
  }
}
