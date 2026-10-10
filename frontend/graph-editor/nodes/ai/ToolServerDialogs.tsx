import { useCallback, useId, useState } from 'react';
import { call, type McpSaved, type McpServerView, type McpServersView } from '../../../app/api/client';
import { errorText } from '../../../app/api/errorText';
import Button from '../../../app/ui/Button';
import Modal from '../../../app/ui/Modal';
import { DANGER_FILL, DANGER_TEXT, DIMMER, FIELD, LINE, MUTED, SUCCESS_TEXT, SUNKEN, TEXT } from '../../../app/ui/theme';
import ServerPage from './ServerPage';

/** How a server stands, as the line under its name in the list. */
function standing(server: McpServerView): string {
  if (server.problem) return server.problem;
  if (server.by_hand) return 'set up by hand in ai-settings.json';
  if (server.values !== null) return server.installed ? 'set up on this machine' : 'its packages are installed when you add it';
  return server.required.length ? 'asks for its settings first' : 'ready to add';
}

/**
 * Add a server to an AI node: pick one of those that came with this
 * installation, or name another.
 *
 * Fewest clicks that are honest. A server that is set up here already is added
 * as it is; one that asks for nothing is set up with its defaults and started
 * once to see that it starts; only one that asks for something, or did not
 * start, opens its form. Setting one up installs its packages when they are
 * not there: adding it is the asking.
 */
export function AddServerDialog({ view, failure, taken, refresh, onAdd, onClose }: {
  view: McpServersView | null;
  /** Why this machine could not be asked, when it could not: a deployed editor, say. */
  failure: string;
  /** What the node has already. */
  taken: string[];
  refresh: () => Promise<void>;
  onAdd: (name: string) => void;
  onClose: () => void;
}) {
  const other = useId();
  const [chosen, setChosen] = useState<string | null>(null);
  const [first, setFirst] = useState<McpSaved | undefined>();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState('');
  const available = (view?.servers ?? []).filter((server) => !taken.includes(server.name));
  const server = view?.servers.find((one) => one.name === chosen);

  const choose = async (one: McpServerView) => {
    if (one.problem) return;
    if (one.by_hand || (one.values !== null && one.installed)) {
      onAdd(one.name);
      return;
    }
    if (one.required.length === 0) {
      setBusy(one.name);
      try {
        const saved = await call('saveMcpServer', { name: one.name, values: one.values ?? {} });
        await refresh();
        if (!saved.problem) {
          onAdd(one.name);
          return;
        }
        setFirst(saved);
      } catch (error) {
        setFirst({ server: one, tools: [], problem: errorText(error, 'It could not be set up.') });
      } finally {
        setBusy('');
      }
    }
    setChosen(one.name);
  };

  if (server) {
    return (
      <ServerDialog
        server={server} delimiter={view?.delimiter ?? ';'} mode="add" first={first} refresh={refresh} onAdded={onAdd}
        onBack={() => { setChosen(null); setFirst(undefined); }} onClose={onClose}
      />
    );
  }

  const addTyped = () => {
    const name = typed.trim();
    if (name && !taken.includes(name)) onAdd(name);
  };

  return (
    <Modal title="Add an MCP server" onClose={onClose} maxWidth="max-w-lg" footer={<Button onClick={onClose}>Cancel</Button>}>
      <div className="p-5 space-y-5">
        <div className="space-y-2">
          {available.map((one) => (
            <button
              key={one.name}
              type="button"
              className="hover-raise w-full text-left rounded-lg px-3 py-2"
              style={{ background: SUNKEN, border: `1px solid ${LINE}` }}
              disabled={busy !== '' || !!one.problem}
              onClick={() => { void choose(one); }}
            >
              <div className="text-sm font-medium" style={{ color: TEXT }}>
                {busy === one.name ? `${one.title}: ${one.installed ? 'starting it' : 'installing and starting it'}…` : one.title}
              </div>
              <div className="text-xs" style={{ color: MUTED }}>{one.about}</div>
              <div className="text-xs mt-0.5" style={{ color: DIMMER }}>{standing(one)}</div>
            </button>
          ))}
          {view && available.length === 0 && (
            <p className="text-xs" style={{ color: DIMMER }}>Every server that came with Tell &amp; Wire is on this node already.</p>
          )}
          {failure && (
            <p className="text-xs" style={{ color: DIMMER }}>This editor cannot set servers up here: {failure}</p>
          )}
        </div>

        <div>
          <label htmlFor={other} className="block text-xs font-medium mb-1" style={{ color: MUTED }}>Another server</label>
          <div className="flex items-center gap-2">
            <input
              id={other}
              className="flex-1 min-w-0 rounded-lg px-3 py-1.5 text-sm font-mono"
              style={FIELD}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addTyped(); }}
              placeholder="https://example.com/mcp, or a name"
              spellCheck={false}
            />
            <Button className="shrink-0" disabled={!typed.trim() || taken.includes(typed.trim())} onClick={addTyped}>Add</Button>
          </div>
          <p className="text-xs mt-1" style={{ color: DIMMER }}>
            A URL is called as it is. A name must be set up under <code>mcp_servers</code> in <code>ai-settings.json</code> on this machine:
            a graph can name a server, never say what starts it.
          </p>
        </div>
      </div>
    </Modal>
  );
}

/**
 * One server's settings: to add it, or to change what this machine has set.
 * What shows is the server's own page; a server that brings none gets its
 * variables as `NAME=value` lines. Saving installs its packages if they are
 * not there, writes the settings to `ai-settings.json` and starts the server
 * once, so that a folder that is not there, or a program that will not start,
 * is said now and not by a run that fails.
 */
export function ServerDialog({ server, delimiter, mode, first, refresh, onAdded, onBack, onClose }: {
  server: McpServerView;
  delimiter: string;
  mode: 'add' | 'edit';
  /** What setting it up already said, for a server that did not start. */
  first?: McpSaved;
  refresh: () => Promise<void>;
  onAdded?: (name: string) => void;
  onBack?: () => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...server.values }));
  const [valid, setValid] = useState(() => server.required.every((key) => !!server.values?.[key]));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [saved, setSaved] = useState<McpSaved | null>(first ?? null);
  const change = useCallback((next: Record<string, string>, ok: boolean) => { setValues(next); setValid(ok); }, []);

  const save = async () => {
    setBusy(true);
    setProblem('');
    setSaved(null);
    try {
      const result = await call('saveMcpServer', { name: server.name, values });
      await refresh();
      setSaved(result);
      if (mode === 'add' && !result.problem) onAdded?.(server.name);
    } catch (error) {
      setProblem(errorText(error, 'It could not be saved.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={mode === 'add' ? `Add ${server.title}` : `${server.title}: settings`}
      onClose={onClose}
      maxWidth="max-w-lg"
      dismissOnBackdrop={false}
      footer={
        <>
          {onBack ? <Button onClick={onBack}>Back</Button> : <Button onClick={onClose}>{saved && !saved.problem ? 'Close' : 'Cancel'}</Button>}
          {mode === 'add' && saved?.problem && <Button onClick={() => onAdded?.(server.name)}>Add anyway</Button>}
          <Button variant="primary" disabled={busy || !valid} onClick={() => { void save(); }}>
            {busy ? (server.installed ? 'Starting it…' : 'Installing…') : mode === 'add' ? 'Add' : server.values === null ? 'Set up' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="p-5 space-y-4">
        <p className="text-xs" style={{ color: MUTED }}>{server.about}</p>

        {server.page
          ? <ServerPage html={server.page} values={values} delimiter={delimiter} onChange={change} />
          : <EnvLines server={server} values={values} onChange={change} />}

        {!server.installed && (
          <p className="text-xs" style={{ color: DIMMER }}>
            Its packages are not installed yet. {mode === 'add' ? 'Adding' : 'Saving'} it installs them first, with npm, in <code>mcp/{server.name}</code>:
            the versions its lockfile names, without running install scripts. It takes about a minute.
          </p>
        )}
        <p className="text-xs" style={{ color: DIMMER }}>
          Saved on this machine, in <code>ai-settings.json</code>: every graph that uses this server here reads it.
        </p>

        {saved && <Outcome saved={saved} />}
        {problem && <p className="text-xs" style={{ color: DANGER_TEXT }} role="alert">{problem}</p>}
      </div>
    </Modal>
  );
}

function Outcome({ saved }: { saved: McpSaved }) {
  if (saved.problem) {
    return (
      <div className="text-xs rounded-lg px-3 py-2" style={{ background: DANGER_FILL, color: DANGER_TEXT }} role="alert">
        <p>It is saved, but it did not start:</p>
        <pre className="whitespace-pre-wrap mt-1">{saved.problem}</pre>
      </div>
    );
  }
  const count = saved.tools.length;
  return (
    <p className="text-xs" style={{ color: SUCCESS_TEXT }} role="status">
      Saved. It starts and offers {count === 1 ? '1 tool' : `${count} tools`}: {saved.tools.join(', ')}.
    </p>
  );
}

/** For a server with no page of its own: what it reads, as `NAME=value` lines, each variable explained below. */
function EnvLines({ server, values, onChange }: {
  server: McpServerView;
  values: Record<string, string>;
  onChange: (values: Record<string, string>, valid: boolean) => void;
}) {
  const id = useId();
  const [text, setText] = useState(() => Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n'));

  const edit = (next: string) => {
    setText(next);
    const parsed: Record<string, string> = {};
    for (const line of next.split(/\r?\n/)) {
      const at = line.indexOf('=');
      if (line.trim() && !line.trim().startsWith('#') && at > 0) parsed[line.slice(0, at).trim()] = line.slice(at + 1).trim();
    }
    onChange(parsed, server.required.every((key) => !!parsed[key]));
  };

  const names = Object.keys(server.env);
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium mb-1" style={{ color: MUTED }}>
        Settings <span style={{ color: DIMMER }}>— one per line, NAME=value</span>
      </label>
      <textarea
        id={id}
        className="w-full rounded-lg px-3 py-2 text-sm font-mono resize-y"
        style={{ ...FIELD, minHeight: 72 }}
        value={text}
        onChange={(e) => edit(e.target.value)}
        placeholder={names[0] ? `${names[0]}=` : ''}
        spellCheck={false}
      />
      {names.length > 0 && (
        <dl className="text-xs mt-2 space-y-1" style={{ color: DIMMER }}>
          {names.map((name) => (
            <div key={name}>
              <dt className="inline font-mono" style={{ color: MUTED }}>{name}</dt>
              {server.required.includes(name) && ' (needed)'}: <dd className="inline">{server.env[name]}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
