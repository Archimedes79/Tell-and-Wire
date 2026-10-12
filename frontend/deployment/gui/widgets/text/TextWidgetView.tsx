import type { WidgetViewProps } from '../WidgetView';
import Markdown from '../../kit/ui/Markdown';
import { DIMMER, MUTED, TEXT } from '../../kit/ui/theme';
import { isHeadingRole, textRole, type TextRole } from '../../../../../gui/widgets/text/role.ts';

/**
 * Prose: a heading of the first or second level, a paragraph, or a caption — one widget, four roles.
 *
 * The role decides size and weight, and nothing else. The text of a paragraph starts at the
 * top of its block, so a block that is taller than its text has the air under it. A heading is
 * one line, as tall as its text, and stands in the middle of its row (`BlockKind.sits`).
 */
export const TEXT_ROLES = {
  h1: { fontSize: 26, fontWeight: 700, color: TEXT, letterSpacing: '-0.02em' },
  h2: { fontSize: 19, fontWeight: 600, color: TEXT, letterSpacing: '-0.01em' },
  body: { fontSize: 13, fontWeight: 400, color: TEXT, letterSpacing: 'normal' },
  caption: { fontSize: 11, fontWeight: 400, color: MUTED, letterSpacing: 'normal' },
} as const satisfies Record<TextRole, object>;

export default function TextWidgetView({ widget }: WidgetViewProps) {
  const role = textRole(widget.mode);
  const style = TEXT_ROLES[role];
  const source = typeof widget.value === 'string' ? widget.value : '';

  if (!source.trim()) {
    return (
      <div className="h-full flex items-start" style={{ color: DIMMER, fontSize: style.fontSize }}>
        {role === 'h1' ? 'Heading 1' : role === 'h2' ? 'Heading 2' : role === 'caption' ? 'Caption' : 'Text…'}
      </div>
    );
  }

  // A heading is one line, so it renders as plain text rather than through the
  // markdown block parser, which would wrap it in a paragraph.
  if (isHeadingRole(role)) {
    return (
      <div
        className="h-full flex items-center"
        style={{ color: style.color, fontSize: style.fontSize, fontWeight: style.fontWeight, letterSpacing: style.letterSpacing }}
      >
        {source}
      </div>
    );
  }

  return (
    <div
      className="h-full overflow-auto flex flex-col items-start"
      style={{ color: style.color, fontSize: style.fontSize }}
    >
      <Markdown source={source} />
    </div>
  );
}
