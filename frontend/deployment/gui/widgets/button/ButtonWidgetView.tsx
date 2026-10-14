import type { WidgetViewProps } from '../WidgetView';
import Button from '../../kit/ui/Button';

/**
 * A button: a press fires the start point the button names.
 *
 * A press is an event and nothing else: it holds no value a round could be
 * sent (`WidgetDefinition.takesValue`). Which button it was, the round's
 * package says (`event.by`).
 */
export default function ButtonWidgetView({ widget, onTrigger, busy }: WidgetViewProps) {
  // As tall as it can be, up to 34px: in a row of one cell -- a window's Run -- there is less room, and a button taller than its
  // room is cut across its label.
  return (
    <Button variant="primary" className="w-full h-[34px] max-h-full !py-0" disabled={busy} onClick={() => onTrigger()}>
      {widget.label || 'Press'}
    </Button>
  );
}
