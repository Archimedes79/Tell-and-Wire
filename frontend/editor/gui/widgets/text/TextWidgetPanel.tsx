import { DIMMER, MUTED } from '../../../../deployment/gui/kit/ui/theme';
import type { WidgetPanelProps } from '../WidgetGuiBuilder';
import { textRole } from '../../../../../gui/widgets/text/role.ts';

/**
 * Prose. The role -- heading, body, caption -- comes from the palette entry you
 * picked and is not offered again here: turning a heading into body text would
 * undo the choice that put it on the gui.
 *
 * There is no text box here either. The words are typed on the gui, where they
 * stand (`TextInPlace`): a second box would be two places to edit one thing.
 */
export default function TextWidgetPanel({ widget }: WidgetPanelProps) {
  const heading = textRole(widget.mode) === 'heading';
  return (
    <div>
      <p className="text-xs" style={{ color: MUTED }}>Click the text on the gui and type.</p>
      {!heading && (
        <p className="text-xs mt-1" style={{ color: DIMMER }}>
          Markdown works: **bold**, *italic*, `code`, [link](url), - lists, and tables with |.
        </p>
      )}
    </div>
  );
}
