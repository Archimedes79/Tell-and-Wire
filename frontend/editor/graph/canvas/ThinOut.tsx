import { useEffect, useState } from 'react';
import { ListChecks } from 'lucide-react';
import { useGraphStore } from '../../document/store/graphStore';
import Button from '../../../deployment/gui/kit/ui/Button';
import { DIM, PANEL } from '../../../deployment/gui/kit/ui/theme';

/**
 * One button on the canvas: every card to the earliest column its wires allow, and the empty
 * rows closed (`thinOut`). It says what that came to, for a moment, beside itself.
 */
export default function ThinOut() {
  const thinOut = useGraphStore((s) => s.thinOut);
  const [said, setSaid] = useState('');
  useEffect(() => {
    if (!said) return undefined;
    const timer = window.setTimeout(() => setSaid(''), 5000);
    return () => window.clearTimeout(timer);
  }, [said]);
  return (
    <div className="flex items-center gap-2 rounded-lg px-1.5 py-1" style={PANEL}>
      <span role="status" className="text-xs max-w-[22rem] truncate" style={{ color: DIM }}>{said}</span>
      <Button
        size="sm"
        onClick={() => setSaid(thinOut())}
        title="Move every card to the earliest column its wires allow, and close the empty rows. Wires drawn round cards are straightened."
      >
        <ListChecks size={14} aria-hidden="true" className="inline mr-1.5 -mt-0.5" />Thin out
      </Button>
    </div>
  );
}
