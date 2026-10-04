import { LINE, SURFACE, TEXT } from '../../app/ui/theme';
import { asText } from '../../../backend/gui-editor/widgets/text_io/text.ts';

/** One output of the graph as a page shows it: what it is called, and what it handed back. */
export interface ShownOutput {
  name: string;
  label: string;
  value: unknown;
}

/**
 * What a tool without a page hands back: each output under its label -- the
 * graph's outputs by name, as any frontend reads them. A page is what a tool
 * shows; without one, this is -- each value as a box of text reads it
 * (`asText`): a record as its keys and values, not its values bare.
 */
export default function RunResult({ outputs }: { outputs: ShownOutput[] }) {
  const shown = outputs.filter((output) => output.value !== undefined);
  if (!shown.length) return null;
  return (
    <div className="mt-4 space-y-3" aria-label="The run's result">
      {shown.map((output) => (
        <section key={output.name} className="rounded-lg overflow-hidden" style={{ background: SURFACE, border: `1px solid ${LINE}` }}>
          <h3 className="px-4 py-2 text-sm font-semibold" style={{ color: TEXT, borderBottom: `1px solid ${LINE}` }}>{output.label}</h3>
          <pre className="px-4 py-3 text-sm whitespace-pre-wrap overflow-auto" style={{ color: TEXT, maxHeight: '60vh' }}>
            {asText(output.value)}
          </pre>
        </section>
      ))}
    </div>
  );
}
