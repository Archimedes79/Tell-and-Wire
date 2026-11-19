import type { GraphNode } from '../../../document/graph';
import Button from '../../../../deployment/gui/kit/ui/Button';
import { DANGER_TEXT, DIM, FIELD, MUTED, TEXT } from '../../../../deployment/gui/kit/ui/theme';
import { PARAM_TYPES, paramProblems, paramsOf, type Param } from '../../../../../graph/nodes/start/params.ts';
import type { NodePanelProps } from '../NodeGuiBuilder';

/** What a parameter starts out as: text a person types, until it is named and typed. */
const NEW_PARAM: Param = { name: '', type: 'text' };

/** One example of the command line these parameters make, as it is typed. */
function exampleLine(params: Param[]): string {
  const shown = params.filter((param) => param.name).map((param) => {
    if (param.type === 'flag') return `--${param.name}`;
    return `--${param.name} ${param.type === 'number' ? (param.default ?? '20') : '"…"'}`;
  });
  return `tool ${shown.join(' ')}`.trim();
}

/**
 * What a start point that a call starts takes, by name: the parameters of its command line. Each is a name -- typed
 * as `--name` -- a kind, what it is when nobody says (or that it must be given), and a sentence for `--help`. They
 * arrive as the package's values under those names, and an input wired from the start point can take one by name.
 */
export default function StartParams({ node, setConfig }: Pick<NodePanelProps, 'setConfig'> & { node: GraphNode }) {
  const params = paramsOf(node as never);
  // What is typed is kept as typed, for the sentence below it to say what is wrong: paramsOf has dropped nothing a person wrote.
  const held = ((node.config as unknown as Record<string, unknown>).params ?? []) as Param[];
  const rows = Array.isArray(held) ? held : [];
  const set = (next: Param[]) => setConfig('params', next);
  const change = (at: number, patch: Partial<Param>) => set(rows.map((param, index) => (index === at ? { ...param, ...patch } : param)));
  const problems = paramProblems(params);
  const input = 'h-8 rounded-md px-2 text-sm min-w-0';
  return (
    <fieldset className="mb-3" aria-label="The command line">
      <legend className="text-xs mb-1" style={{ color: DIM }}>The command line takes</legend>
      <p className="text-xs mb-2" style={{ color: DIM }}>
        The tool is run with them, as <code>{params.some((param) => param.name) ? exampleLine(params) : 'tool --text "…"'}</code>, and <code>--help</code> says
        what each is. Each arrives in the package under its name; a node wired from here takes it by that name.
      </p>
      <ul className="flex flex-col gap-2">
        {rows.map((param, at) => (
          <li key={at} className="flex flex-wrap items-center gap-2 rounded-lg p-2" style={{ border: `1px solid ${DIM}33` }}>
            <span className="text-sm" style={{ color: MUTED }}>--</span>
            <input
              className={`${input} w-32 font-mono`} style={FIELD} value={param.name} placeholder="name"
              onChange={(event) => change(at, { name: event.target.value })} aria-label={`Parameter ${at + 1} name`}
            />
            <select
              className={`${input} w-24`} style={FIELD} value={param.type}
              onChange={(event) => change(at, { type: event.target.value as Param['type'] })} aria-label={`Parameter ${at + 1} kind`}
            >
              {PARAM_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            {param.type !== 'flag' && (
              <input
                className={`${input} w-28`} style={FIELD} value={param.default ?? ''} placeholder="default"
                onChange={(event) => change(at, { default: event.target.value })} aria-label={`Parameter ${at + 1} default`}
              />
            )}
            {param.type !== 'flag' && (
              <label className="flex items-center gap-1 text-xs" style={{ color: TEXT }}>
                <input type="checkbox" checked={!!param.required} onChange={(event) => change(at, { required: event.target.checked })} />
                required
              </label>
            )}
            <input
              className={`${input} w-full`} style={FIELD} value={param.description ?? ''} placeholder="what it is, in a sentence: --help says it"
              onChange={(event) => change(at, { description: event.target.value })} aria-label={`Parameter ${at + 1} description`}
            />
            <button
              type="button" className="px-1 rounded" style={{ color: DIM }} title="Take this parameter away"
              aria-label={`Take parameter ${at + 1} away`} onClick={() => set(rows.filter((_, index) => index !== at))}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2">
        <Button size="sm" onClick={() => set([...rows, { ...NEW_PARAM }])} title="Add a named value the command line takes">＋ Add parameter</Button>
      </div>
      {problems.map((problem) => <p key={problem} className="text-xs mt-1" role="alert" style={{ color: DANGER_TEXT }}>{problem}</p>)}
    </fieldset>
  );
}
