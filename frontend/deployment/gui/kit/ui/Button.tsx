import type { ButtonHTMLAttributes } from 'react';
import { ACCENT, DANGER_TEXT, LINE, MUTED, ON_ACCENT, TEXT } from './theme';

/**
 * The one button of dialogs, panels and the page: every `<button>` that is not
 * a toolbar icon (`ToolbarButton`) or a palette row is this, so a size, a hover
 * or a disabled look is changed once.
 *
 * `variant`, how much it asks for:
 *  - `primary`   the one action of a dialog or panel: accent fill. One per footer.
 *  - `secondary` the default: a filled neutral button (Cancel, Browse, Stop).
 *  - `danger`    quiet, in the danger colour: Discard, and the 🗑 that deletes
 *                a node or a block. Never a red fill.
 *  - `quiet`     no fill: ✕ closers, icon buttons, a toggle that is off.
 *
 * `size`: `md` (default) for dialogs and panels, `sm` for a row, a chip or a
 * block's toolbar. A dialog uses one size.
 *
 * Everything else is a plain `<button>` prop: `onClick`, `disabled` (dimmed,
 * no hover), `title`, `aria-label`, `autoFocus`, `form`. `type` is `button`
 * unless given, so a button in a `<form>` never submits it by accident; the
 * form's own button says `type="submit"`. `className` is for layout only
 * (`shrink-0`, `ml-auto`, `w-full`): colour, size and rounding are the
 * button's.
 *
 * An icon-only button has no words: give it `aria-label` and `title`.
 * A toggle is `variant={on ? 'primary' : 'quiet'}` with `aria-pressed={on}`.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'quiet';
type ButtonSize = 'sm' | 'md';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'style'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const LOOK = {
  primary: { style: { background: ACCENT, color: ON_ACCENT }, className: 'btn-fill font-semibold' },
  secondary: { style: { background: LINE, color: TEXT }, className: 'btn-fill font-medium' },
  danger: { style: { color: DANGER_TEXT }, className: 'btn-danger font-medium' },
  quiet: { style: { color: MUTED }, className: 'hover-raise font-medium' },
} as const;

const SIZE = { sm: 'px-2.5 py-1 text-xs', md: 'px-3 py-1.5 text-sm' } as const;

export default function Button({ variant = 'secondary', size = 'md', type = 'button', className = '', ...rest }: ButtonProps) {
  const look = LOOK[variant];
  return (
    <button
      type={type}
      className={`btn rounded-lg ${look.className} ${SIZE[size]} ${className}`}
      style={look.style}
      {...rest}
    />
  );
}
