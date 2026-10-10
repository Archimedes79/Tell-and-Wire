import { DIMMER, MUTED } from '../../app/ui/theme';
import type { WidgetPanelProps } from './WidgetGuiBuilder';
import type { DisplayWidgetGuiBuilder } from './DisplayWidgetGuiBuilder';

/**
 * A chart, a table or an image: what it shows, in a line, and under "What it
 * expects" -- folded -- the words the node wired into the end point it shows
 * is told (`DisplayWidgetRunner.draws`). There is nothing to write here: what
 * reshapes a value first is a code node before that end point.
 */
export default function DisplayWidgetPanel({ builder }: WidgetPanelProps) {
  return (
    <div className="space-y-1">
      <p className="text-xs" style={{ color: MUTED }}>Shows what reaches its end point.</p>
      <details className="text-xs" style={{ color: DIMMER }}>
        <summary className="cursor-pointer select-none" style={{ color: MUTED }}>What it expects</summary>
        <p className="mt-1">
          It should be {(builder as DisplayWidgetGuiBuilder).runner.draws()} Anything else is shaped into that by a code node wired in before the end point.
        </p>
      </details>
    </div>
  );
}
