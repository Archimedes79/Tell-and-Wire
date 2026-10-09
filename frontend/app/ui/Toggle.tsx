import { ACCENT, LINE, ON_ACCENT, TEXT } from './theme';

/**
 * An on/off switch. Say what it switches in `label` (read aloud, and its
 * tooltip when `title` is not given): a switch has no words of its own.
 */
export default function Toggle({ on, onChange, label, title }: {
  on: boolean;
  onChange: (on: boolean) => void;
  label: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={title ?? label}
      onClick={() => onChange(!on)}
      className="relative shrink-0 rounded-full"
      style={{ width: 34, height: 20, background: on ? ACCENT : LINE }}
    >
      <span
        aria-hidden="true"
        className="absolute rounded-full"
        style={{ top: 3, left: on ? 17 : 3, width: 14, height: 14, background: on ? ON_ACCENT : TEXT, transition: 'left 0.12s' }}
      />
    </button>
  );
}
