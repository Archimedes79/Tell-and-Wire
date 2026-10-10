import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import Button from '../../app/ui/Button';
import { DIM, LINE, PANEL, TEXT } from '../../app/ui/theme';

/** A node to step to from this one, and what it is called. */
interface Step { label: string; onClick: () => void }

/** The way back to the graph: the same button wherever the node view is drawn. */
export function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <Button variant="quiet" size="sm" onClick={onBack} title="Back to the graph (Esc)">
      <span className="inline-flex items-center gap-1.5"><ArrowLeft size={14} strokeWidth={2} aria-hidden="true" /> Graph</span>
    </Button>
  );
}

/** The arrow to the node before or after: a step when there is one, a small menu of them when there are several. */
function Arrow({ steps, word, icon: Icon }: { steps: Step[]; word: 'Before' | 'After'; icon: LucideIcon }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event.type === 'keydown' ? (event as KeyboardEvent).key === 'Escape' : !box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const [only] = steps;
  const none = `Nothing ${word.toLowerCase()} it`;
  return (
    <span ref={box} className="relative inline-flex">
      <Button
        variant="quiet"
        size="sm"
        disabled={steps.length === 0}
        onClick={steps.length > 1 ? () => setOpen(!open) : only?.onClick}
        aria-haspopup={steps.length > 1 ? 'menu' : undefined}
        aria-expanded={steps.length > 1 ? open : undefined}
        aria-label={steps.length > 1 ? `${word}: ${steps.length} nodes` : only ? `${word}: ${only.label}` : none}
        title={steps.length > 1 ? `${steps.length} nodes are wired ${word.toLowerCase()} it: choose one`
          : only ? `${word} it in the graph: ${only.label}` : `No node is wired ${word.toLowerCase()} it`}
      >
        <Icon size={16} strokeWidth={2} aria-hidden="true" />
      </Button>
      {open && (
        <div role="menu" aria-label={word} className="absolute right-0 top-full z-50 mt-1 min-w-40 rounded-lg py-1 shadow-2xl" style={PANEL}>
          {steps.map((step) => (
            <button
              key={step.label}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); step.onClick(); }}
              className="block w-full px-3 py-1.5 text-left text-sm hover-raise"
              style={{ color: TEXT }}
            >
              {step.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

/**
 * The top line of the node view: the way back to the graph, what kind of node
 * this is and its id, and a step to the nodes before and after.
 */
export default function NodeHeader({ kind, icon: Icon, ink, id, onBack, before, after }: {
  kind: string;
  icon: LucideIcon;
  /** The kind's colour as ink on a surface. */
  ink: string;
  id: string;
  onBack: () => void;
  before: Step[];
  after: Step[];
}) {
  return (
    <>
      <BackButton onBack={onBack} />
      <span aria-hidden="true" style={{ width: 1, height: 18, background: LINE }} />
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: TEXT }}>
        <Icon size={15} strokeWidth={2} aria-hidden="true" style={{ color: ink }} />
        {kind}
      </span>
      <span className="truncate font-mono text-xs" style={{ color: DIM }} title={`Its id: ${id}`}>{id}</span>
      <span className="flex-1" />
      <Arrow steps={before} word="Before" icon={ChevronLeft} />
      <Arrow steps={after} word="After" icon={ChevronRight} />
    </>
  );
}
