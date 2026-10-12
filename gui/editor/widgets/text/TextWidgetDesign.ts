import { WidgetDesign } from '../WidgetDesign.ts';

export class TextWidgetDesign extends WidgetDesign {
  override graphAuthorNote(): string {
    return 'mode heading|body|caption, value = the words';
  }
}
