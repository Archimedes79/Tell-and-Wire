import { DIMMER, MUTED } from '../../../../deployment/gui/kit/ui/theme';
import Button from '../../../../deployment/gui/kit/ui/Button';
import type { WidgetPanelProps } from '../WidgetGuiBuilder';
import { isHeadingRole, textRole, type TextRole } from '../../../../../gui/widgets/text/role.ts';

/** How the words can be set, as a person calls it. */
const STYLES: { role: TextRole; label: string; title: string }[] = [
  { role: 'h1', label: 'H1', title: 'Heading 1: the title' },
  { role: 'h2', label: 'H2', title: 'Heading 2: a heading' },
  { role: 'body', label: 'Text', title: 'A paragraph' },
  { role: 'caption', label: 'Caption', title: 'Small, quiet text' },
];

/**
 * Prose. The style -- H1, H2, text, caption -- is chosen here, one click, and it changes only how
 * the words are set.
 *
 * There is no text box here: the words are typed on the GUI, where they stand (`TextInPlace`); a
 * second box would be two places to edit one thing.
 */
export default function TextWidgetPanel({ widget, onUpdate }: WidgetPanelProps) {
  const role = textRole(widget.mode);
  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Style" className="flex gap-1">
        {STYLES.map((style) => (
          <Button
            key={style.role}
            size="sm"
            variant={role === style.role ? 'primary' : 'secondary'}
            aria-pressed={role === style.role}
            title={style.title}
            onClick={() => onUpdate({ mode: style.role })}
          >
            {style.label}
          </Button>
        ))}
      </div>
      <p className="text-xs" style={{ color: MUTED }}>Click the text on the GUI and type.</p>
      {!isHeadingRole(role) && (
        <p className="text-xs" style={{ color: DIMMER }}>
          Markdown works: **bold**, *italic*, `code`, [link](url), - lists, and tables with |.
        </p>
      )}
    </div>
  );
}
