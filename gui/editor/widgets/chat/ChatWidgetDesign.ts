import { WidgetDesign } from '../WidgetDesign.ts';

export class ChatWidgetDesign extends WidgetDesign {
  override graphAuthorNote(): string {
    return 'keeps the conversation itself. When the person sends, it fires the start point named in "fires" and '
      + 'sends {"message": what was just said, "history": everything before it}; it shows the end point named in '
      + '"shows" -- the answer, which joins the conversation. A chatbot is therefore a chat block that sends to and '
      + 'fires one start point, the ai node that start point\'s data is wired to, and the end point its output is '
      + 'wired to, which the chat shows. Do not add data or code nodes to hold the conversation.';
  }

  /** A conversation is what using the GUI said: the session's, never the design's. */
  override valueIsDesign(): boolean {
    return false;
  }
}
