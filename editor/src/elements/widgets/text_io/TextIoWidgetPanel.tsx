import { useId } from 'react';
import { textIoRole } from '@engine/elements/widgets/text_io/role.ts';
import { DIM, FIELD_ON_SURFACE, MUTED } from '@/ui/theme';
import type { WidgetPanelProps } from '../../WidgetGuiBuilder';

export default function TextIoWidgetPanel({ widget, onUpdate }: WidgetPanelProps) {
  const mode = textIoRole(widget.mode);
  const id = useId();

  return (
    <div className="space-y-2">
      <div>
        <label htmlFor={`${id}-mode`} className="block text-xs font-medium mb-1" style={{ color: MUTED }}>
          Mode
        </label>
        <select
          id={`${id}-mode`}
          className="w-full rounded-lg px-2 py-1.5 text-sm"
          style={FIELD_ON_SURFACE}
          value={mode}
          onChange={(e) => onUpdate({ mode: e.target.value })}
        >
          <option value="input">Input — the person types, and it is sent</option>
          <option value="output">Output — shows what an end point hands back</option>
          <option value="both">Both — sends what is typed, shows what comes back</option>
        </select>
      </div>

      {mode !== 'output' && (
        <div>
          <label htmlFor={`${id}-value`} className="block text-xs font-medium mb-1" style={{ color: MUTED }}>
            Default / Initial value
          </label>
          <textarea
            id={`${id}-value`}
            className="w-full rounded-lg px-2 py-1.5 text-sm font-mono"
            style={{ ...FIELD_ON_SURFACE, minHeight: 60 }}
            value={typeof widget.value === 'string' ? widget.value : ''}
            onChange={(e) => onUpdate({ value: e.target.value })}
            placeholder="Leave blank for no default…"
          />
        </div>
      )}

      {mode === 'output' && (
        <p className="text-xs" style={{ color: DIM }}>
          It sends nothing: it shows what arrives at the end point it shows, as text.
        </p>
      )}
      {mode === 'input' && (
        <p className="text-xs" style={{ color: DIM }}>
          It shows nothing: what is typed is sent to the start points its data goes to.
        </p>
      )}
    </div>
  );
}
