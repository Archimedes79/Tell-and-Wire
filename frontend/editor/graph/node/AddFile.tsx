import { useId, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import Button from '../../../deployment/gui/kit/ui/Button';
import { DANGER_TEXT, DIMMER, FIELD } from '../../../deployment/gui/kit/ui/theme';

/** What a new file holds: something that loads, so the first look at it says what it is for. */
export function seedFor(name: string): string {
  const kind = name.slice(name.lastIndexOf('.') + 1);
  if (kind === 'mjs') return `// ${name}: code.js loads it with import.\nexport {};\n`;
  if (kind === 'js' || kind === 'cjs') return `// ${name}: code.js loads it with require('./${name}').\nmodule.exports = {};\n`;
  if (kind === 'json') return '{}\n';
  if (kind === 'csv') return 'name,value\n';
  return `${name}\n`;
}

/** The first of helper.js, helper2.js, … that is not taken. */
function freeName(taken: string[]): string {
  for (let n = 1; ; n += 1) {
    const name = n === 1 ? 'helper.js' : `helper${n}.js`;
    if (!taken.includes(name)) return name;
  }
}

/**
 * "+ Add file": a name to type -- the field is the way a file is named, and
 * the name is what `require('./name')` says -- and Enter makes it. Esc, or
 * leaving the field empty, thinks better of it.
 */
export default function AddFile({ taken, accepts, onAdd }: {
  /** The names the node's folder holds already. */
  taken: string[];
  /** Whether the node can keep a file of this name (`NodeDefinition.fieldOfFile`). */
  accepts: (name: string) => boolean;
  onAdd: (name: string) => void;
}) {
  const [name, setName] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const described = useId();

  if (name === null) {
    return (
      <Button
        size="sm"
        onClick={() => { setName(freeName(taken)); requestAnimationFrame(() => field.current?.select()); }}
        title="Add a file beside code.js: code it loads, or the data it reads"
      >
        <span className="inline-flex items-center gap-1.5"><Plus size={13} strokeWidth={2.4} aria-hidden="true" /> Add file</span>
      </Button>
    );
  }

  const problem = taken.includes(name) ? `${name} is here already.`
    : !accepts(name) ? 'A name of letters, digits, _ . -, ending in .js, .mjs, .cjs, .json, .csv or .txt.' : '';
  const add = () => {
    if (problem) return;
    onAdd(name);
    setName(null);
  };
  return (
    <div className="flex flex-col gap-1">
      <input
        ref={field}
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value.trim())}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); add(); }
          if (event.key === 'Escape') { event.stopPropagation(); setName(null); }
        }}
        onBlur={() => { if (!name || problem) setName(null); }}
        aria-label="Name of the new file"
        aria-describedby={described}
        spellCheck={false}
        className="w-full rounded-lg px-3 py-1.5 text-sm font-mono"
        style={FIELD}
      />
      <p id={described} className="text-xs" style={{ color: problem ? DANGER_TEXT : DIMMER }}>
        {problem || 'Enter makes it. code.js loads it with require(\'./' + name + '\').'}
      </p>
    </div>
  );
}
