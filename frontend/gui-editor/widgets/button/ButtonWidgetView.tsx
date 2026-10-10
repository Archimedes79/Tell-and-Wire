import type { WidgetViewProps } from '../WidgetView';
import Button from '../../../app/ui/Button';

/**
 * Runtime button widget: a press fires the start point the button names.
 *
 * A press is an event and nothing else: it holds no value a round could be
 * sent (`ButtonWidgetRunner.takesValue`). Which button it was, the round's
 * package says (`event.by`).
 */
export default function ButtonWidgetView({ widget, onTrigger, busy }: WidgetViewProps) {
  return (
    <Button variant="primary" className="w-full h-full" disabled={busy} onClick={() => onTrigger()}>
      {widget.label || 'Press'}
    </Button>
  );
}
