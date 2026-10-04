import Button from '../../app/ui/Button';

/**
 * "⤓ Save" in the top-right corner of what a block shows -- a text, a chart,
 * rows -- for a block that has something to save (`download.ts` makes the
 * file). Drawn inside the element it saves the contents of, which is
 * `relative` and the hover `group`, and not scrolled with it.
 *
 * Out of sight until that element is pointed at, or the button is reached
 * with the keyboard: a page is for reading what it shows, and a button on
 * every block would be read first.
 */
export default function SaveButton({ title, onSave }: { title: string; onSave: () => void }) {
  return (
    <Button
      size="sm"
      onClick={onSave}
      title={title}
      aria-label={title}
      // Clear of a scrollbar at the right edge, which it would otherwise cover.
      className="absolute top-1 right-3 z-10 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
    >
      ⤓ Save
    </Button>
  );
}
