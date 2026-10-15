// What the model sent back when its answer could not be made into windows, beside the error that says so: the person reads what it
// wrote, to say it again in other words, or to change one window by hand -- instead of an error with nothing behind it.

import { useNotebook } from '../document/store';

export default function ModelSaid() {
  const said = useNotebook((s) => s.said);
  if (!said) return null;
  return (
    <details className="nb-said">
      <summary>What the model sent</summary>
      <pre>{said}</pre>
      <div className="nb-note">Describe one window at a time, or in other words, and build again.</div>
    </details>
  );
}
