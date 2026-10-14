import { WidgetDesign } from '../WidgetDesign.ts';

export class TextWidgetDesign extends WidgetDesign {
  override graphAuthorNote(): string {
    return 'mode h1|h2|body|caption (h1 the title, h2 a heading), value = the words';
  }
}
