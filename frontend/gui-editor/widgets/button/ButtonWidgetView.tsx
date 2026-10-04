import type { WidgetViewProps } from '../WidgetView';
import { PRIMARY_BUTTON } from '../../../app/ui/theme';

/**
 * Runtime button widget: a press fires the start point the button names.
 *
 * A press is an event and nothing else: it holds no value a round could be
 * sent (`ButtonWidgetRunner.takesValue`). Which button it was, the round's
 * package says (`event.by`).
 */
export default function ButtonWidgetView({ widget, onTrigger, busy }: WidgetViewProps) {
  return (
    <button
      type="button"
      className="w-full h-full rounded-lg text-sm font-medium"
      style={{ ...PRIMARY_BUTTON, opacity: busy ? 0.6 : 1 }}
      disabled={busy}
      onClick={() => onTrigger?.()}
    >
      {widget.label || 'Press'}
    </button>
  );
}
