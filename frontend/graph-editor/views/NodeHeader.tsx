import { ArrowLeft, ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import Button from '../../app/ui/Button';
import { DIM, LINE, TEXT } from '../../app/ui/theme';

/** A node to step to from this one, and what it is called. */
interface Step { label: string; onClick: () => void }

/**
 * The top line of the node view: the way back to the graph, what kind of node
 * this is and its id, and a step to the node before and the node after.
 */
export default function NodeHeader({ kind, icon: Icon, ink, id, onBack, previous, next }: {
  kind: string;
  icon: LucideIcon;
  /** The kind's colour as ink on a surface. */
  ink: string;
  id: string;
  onBack: () => void;
  previous?: Step;
  next?: Step;
}) {
  return (
    <>
      <Button variant="quiet" size="sm" onClick={onBack} title="Back to the graph (Esc)">
        <span className="inline-flex items-center gap-1.5"><ArrowLeft size={14} strokeWidth={2} aria-hidden="true" /> Graph</span>
      </Button>
      <span aria-hidden="true" style={{ width: 1, height: 18, background: LINE }} />
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: TEXT }}>
        <Icon size={15} strokeWidth={2} aria-hidden="true" style={{ color: ink }} />
        {kind}
      </span>
      <span className="truncate font-mono text-xs" style={{ color: DIM }} title={`Its id: ${id}`}>{id}</span>
      <span className="flex-1" />
      {([['previous', previous, ChevronLeft, 'Before'], ['next', next, ChevronRight, 'After']] as const).map(([key, step, Arrow, word]) => (
        <Button
          key={key}
          variant="quiet"
          size="sm"
          disabled={!step}
          onClick={step?.onClick}
          aria-label={step ? `${word}: ${step.label}` : `Nothing ${word.toLowerCase()} it`}
          title={step ? `${word} it in the graph: ${step.label}` : `No node is wired ${word.toLowerCase()} it`}
        >
          <Arrow size={16} strokeWidth={2} aria-hidden="true" />
        </Button>
      ))}
    </>
  );
}
