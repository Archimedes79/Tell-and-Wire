import { DIMMER, MUTED } from '@/ui/theme';
import type { WidgetPanelProps } from '../WidgetGuiBuilder';
import { DisplayWidgetGuiBuilder } from './DisplayWidgetGuiBuilder';

/**
 * A chart, a table or an image: what it shows, in one sentence -- the words
 * the node wired into the end point it shows is told
 * (`DisplayWidgetRunner.draws`). There is nothing to write here: what
 * reshapes a value first is a code node before that end point.
 */
export default function DisplayWidgetPanel({ builder }: WidgetPanelProps) {
  if (!(builder instanceof DisplayWidgetGuiBuilder)) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs" style={{ color: MUTED }}>Shows what reaches its end point, which should be {builder.runner.draws()}</p>
      <p className="text-xs" style={{ color: DIMMER }}>Anything else is shaped into that by a code node wired in before the end point.</p>
    </div>
  );
}
