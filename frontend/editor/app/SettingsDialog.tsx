import { useEffect, useState } from 'react';
import type { AIProvider } from '../document/graph';
import { call, type SettingsPatch, type SettingsStatus } from '../api/client';
import { errorText } from '../../deployment/gui/kit/api/errorText';
import ProviderModelSelect, { AI_PROVIDER_LABELS, nowText, refreshProviderStatus, useProviderStatus, type Purpose } from './fields/ProviderModelSelect';
import Modal from '../../deployment/gui/kit/ui/Modal';
import Button from '../../deployment/gui/kit/ui/Button';
import { DEFAULT_ENDPOINTS } from '../../../graph/endpoints.ts';
import { SCHEMES } from '../../deployment/gui/kit/ui/scheme';
import { useEditorScheme, type EditorSchemeChoice } from '../document/store/editorScheme';
import { ACCENT_FILL, ACCENT_TEXT, DANGER_TEXT, DIM, DIMMER, FIELD, LINE, MUTED, SUCCESS, TEXT } from '../../deployment/gui/kit/ui/theme';

/** Where each provider's key comes from, said where the key is typed. */
const KEY_HINTS: Record<string, string> = {
  openai: 'From platform.openai.com',
  anthropic: 'From console.anthropic.com',
  google: 'Free key from aistudio.google.com/apikey',
  github_copilot: 'A GitHub token with the models:read scope',
  openai_compatible: 'Whatever your endpoint expects',
};

const label = (id: string): string => AI_PROVIDER_LABELS[id as AIProvider] ?? id;

/** Where an AI comes from and what it takes, said under the provider that is chosen: the first question of someone who has none yet. */
const PROVIDER_HELP: Partial<Record<AIProvider, string>> = {
  ollama: 'Free, on your computer or another one: install Ollama (ollama.com), then run `ollama pull llama3` in a terminal.',
  lmstudio: 'Free, on your computer: load a model in LM Studio and start its local server.',
  google: 'Free tier: get a key at aistudio.google.com/apikey and paste it below.',
  github_copilot: 'Free tier: a GitHub token with the models:read scope, pasted below.',
  openai: 'Paid: paste a key below.',
  anthropic: 'Paid: paste a key below.',
  openai_compatible: 'Any server that speaks the OpenAI API: its address below.',
};

/**
 * What a chosen AI comes to and what is wrong with it: where it comes from and what it takes, what
 * it resolves to now, and -- for the AI as it is saved, not for a choice not saved yet -- why it
 * cannot answer. Where an environment variable sets it, that wins over what is saved here.
 */
function Chosen({ purpose, provider, saved, probe, children }: {
  purpose: Purpose; provider: AIProvider; saved?: SettingsStatus['ai']; probe: ReturnType<typeof useProviderStatus>;
  /** What it needs to be reached -- its server's address, its key -- between where it comes from and what it comes to. */
  children?: React.ReactNode;
}) {
  const trouble = purpose === 'write' ? probe?.writing_problem : probe?.problem;
  // A writing AI left to the nodes' says nothing of its own: it is the nodes' problem, said there.
  const own = purpose === 'run' || !!saved?.provider || !!saved?.model;
  return (
    <>
      {PROVIDER_HELP[provider] && <p className="text-xs mt-2" style={{ color: DIM }}>{PROVIDER_HELP[provider]}</p>}
      {children}
      <p className="text-xs mt-3" style={{ color: DIM }}>Now: <strong style={{ color: TEXT }}>{nowText(probe, purpose)}</strong></p>
      {trouble && own && provider === (saved?.provider || 'default') && <p className="text-xs mt-1" style={{ color: DANGER_TEXT }} role="status">{trouble}</p>}
      {saved && saved.environment.length > 0 && (
        <div className="text-xs rounded-lg px-3 py-2 mt-3" style={{ background: ACCENT_FILL, color: ACCENT_TEXT }}>
          {saved.environment.map((variable, i) => <span key={variable}>{i > 0 && ' and '}<code>{variable}</code></span>)}{' '}
          {saved.environment.length > 1 ? 'are' : 'is'} set where the editor was started and wins over what is saved here.
        </div>
      )}
    </>
  );
}

/** The providers a model may run on another computer: the hint about an address is for these, not for a cloud service. */
const NETWORK_MODELS = new Set(['ollama', 'lmstudio', 'openai_compatible']);

/**
 * The model a provider chosen starts with: the one saved, where it is the provider saved -- else none, and
 * the box names what to expect. A model name belongs to the provider it was typed for: "llama3" under Gemini is a mistake.
 */
function modelFor(provider: string, saved: { provider: string; model: string } | undefined): string {
  return saved && provider === (saved.provider || 'default') ? saved.model : '';
}

/**
 * The AI the tool asks and what it needs to ask it, as one form with one Save:
 * the provider and model that Auto generate, ▶ Try and every run call wherever a node
 * names none, the keys, and the servers' addresses. This machine's, saved in
 * `ai-settings.json` and never in a graph, so a graph handed to someone else
 * runs on whatever they chose.
 *
 * Keys are write-only by design: the server reports whether one is set and
 * where it came from, never its value, so a key never travels back into the
 * browser. The rows are what the backend's status names (`CREDENTIALS`,
 * `ENDPOINT_ENV` in `backend/deployment/runtime/ai/providers.ts`), not a list of their own.
 *
 * "Now" is the backend's answer (`providers`), not worked out here: it is what
 * a run will call, environment and all.
 */
export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const probe = useProviderStatus();
  const colours = useEditorScheme();
  const [saved, setSaved] = useState<SettingsStatus | null>(null);
  const [provider, setProvider] = useState<AIProvider>('default');
  const [model, setModel] = useState('');
  const [writingProvider, setWritingProvider] = useState<AIProvider>('default');
  const [writingModel, setWritingModel] = useState('');
  const [endpoints, setEndpoints] = useState<Record<string, string>>({});
  /** Keys typed and not saved yet, by provider; and the stored keys to take away. */
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<string[]>([]);
  const [problem, setProblem] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // A local model that started since the editor did is running now: asked again as Settings opens.
    refreshProviderStatus();
    call('aiSettings').then((data) => {
      setSaved(data);
      setProvider((data.ai.provider || 'default') as AIProvider);
      setModel(data.ai.model);
      setWritingProvider((data.writing.provider || 'default') as AIProvider);
      setWritingModel(data.writing.model);
      setEndpoints(data.endpoints);
    }).catch((error) => setProblem(errorText(error, 'Could not read the AI settings file.')));
  }, []);

  // The keys the two AIs need come first, the nodes' before the writing one's.
  const needed = [provider === 'default' ? probe?.target.provider : provider, writingProvider === 'default' ? probe?.writing.provider : writingProvider];
  const rank = (id: string) => { const at = needed.indexOf(id); return at < 0 ? needed.length : at; };
  const typedKeys = Object.fromEntries(Object.entries(keys).map(([id, key]) => [id, key.trim()]).filter(([, key]) => key));
  const changed = saved !== null && (
    provider !== (saved.ai.provider || 'default') || model !== saved.ai.model
    || writingProvider !== (saved.writing.provider || 'default') || writingModel !== saved.writing.model
    || Object.keys(saved.endpoints).some((id) => (endpoints[id] ?? '') !== saved.endpoints[id])
    || Object.keys(typedKeys).length > 0 || removing.length > 0
  );

  const save = async () => {
    const patch: SettingsPatch = { ai: { provider, model }, writing: { provider: writingProvider, model: writingModel }, endpoints, api_keys: typedKeys, clear_keys: removing };
    setSaving(true);
    setProblem('');
    try {
      await call('saveAiSettings', patch);
      refreshProviderStatus();
      onClose();
    } catch (error) {
      setProblem(errorText(error, 'Could not save the AI settings file.'));
      setSaving(false);
    }
  };

  const toggleRemoving = (id: string) => setRemoving((now) => (now.includes(id) ? now.filter((one) => one !== id) : [...now, id]));

  /** The key of provider *id*: whether one is set and from where, and a box to type a new one in. */
  const keyRow = (id: string) => {
    const state = saved?.credentials[id];
    if (!state) return null;
    const going = removing.includes(id);
    return (
      <div key={id} className="flex items-center gap-2">
        <div className="w-36 shrink-0">
          <div className="text-xs font-medium" style={{ color: TEXT }}>{label(id)} key</div>
          <div className="text-xs" style={{ color: going ? DANGER_TEXT : state.configured ? SUCCESS : DIMMER }}>
            {going ? 'key will be removed' : state.configured ? `key set (${state.source})` : 'no key'}
          </div>
        </div>
        <input
          type="password"
          className="flex-1 min-w-0 rounded-lg px-2 py-1.5 text-sm font-mono"
          style={FIELD}
          value={keys[id] ?? ''}
          onChange={(e) => setKeys((now) => ({ ...now, [id]: e.target.value }))}
          placeholder={state.configured ? 'Enter a new key to replace it' : KEY_HINTS[id] ?? 'Its API key'}
          autoComplete="off"
          disabled={going}
          aria-label={`${label(id)} API key`}
        />
        {state.configured && state.source === 'settings file' && (
          <Button
            size="sm"
            className="shrink-0"
            onClick={() => toggleRemoving(id)}
            title={going ? 'Keep the stored key' : `Remove the stored ${label(id)} key`}
          >
            {going ? 'Keep' : 'Remove'}
          </Button>
        )}
      </div>
    );
  };

  /** The address of the server provider *id* is asked at: this computer's by default, or any other the editor can reach. */
  const addressRow = (id: string) => {
    if (!saved || !(id in saved.endpoints)) return null;
    return (
      <div key={id} className="flex items-center gap-2">
        <label htmlFor={`address-${id}`} className="w-36 shrink-0 text-xs font-medium" style={{ color: TEXT }}>{label(id)} address</label>
        <input
          id={`address-${id}`}
          className="flex-1 min-w-0 rounded-lg px-2 py-1.5 text-sm font-mono"
          style={FIELD}
          value={endpoints[id] ?? ''}
          onChange={(e) => setEndpoints((now) => ({ ...now, [id]: e.target.value }))}
          placeholder={DEFAULT_ENDPOINTS[id] || 'https://my-endpoint.example.com/v1'}
        />
      </div>
    );
  };

  /** What provider *id* needs to be asked at all, under the choice of it: where its server is, and its key. */
  const connection = (id: string | undefined) => {
    if (!saved || !id) return null;
    const rows = [addressRow(id), keyRow(id)].filter(Boolean);
    if (!rows.length) return null;
    return (
      <div className="mt-3 space-y-2">
        {rows}
        {NETWORK_MODELS.has(id) && id in saved.endpoints && (
          <p className="text-xs" style={{ color: DIM }}>
            A model on another computer works too: enter its address, for example <code>http://192.168.1.20:11434</code>. The computer that runs the editor must reach it.
          </p>
        )}
      </div>
    );
  };

  return (
    <Modal
      title="⚙ Settings"
      onClose={onClose}
      maxWidth="max-w-2xl"
      dismissOnBackdrop={false}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => { void save(); }} disabled={!changed || saving}>{saving ? '…' : 'Save'}</Button>
        </>
      }
    >
      <div className="p-5 space-y-6">
        <section>
          <h3 className="text-sm font-semibold mb-1" style={{ color: TEXT }}>Appearance</h3>
          <p className="text-xs mb-3" style={{ color: DIM }}>
            The colours of this editor, kept in this browser. A tool's own colours -- its GUI tab and what it is delivered as -- are chosen on the GUI tab.
          </p>
          <label htmlFor="editor-colours" className="sr-only">Colour scheme of the editor</label>
          <select
            id="editor-colours"
            className="w-full rounded-lg px-2 py-1.5 text-sm"
            style={FIELD}
            value={colours.choice}
            // Applied at once, and kept: it is not one of the settings Save writes.
            onChange={(event) => colours.choose(event.target.value as EditorSchemeChoice)}
          >
            <option value="auto">Automatic — follows your system</option>
            {SCHEMES.map((one) => <option key={one.id} value={one.id}>{one.label}</option>)}
          </select>
        </section>

        <section>
          <h3 className="text-sm font-semibold mb-1" style={{ color: TEXT }}>AI that runs the nodes</h3>
          <p className="text-xs mb-3" style={{ color: DIM }}>
            What AI nodes, a code node&apos;s <code>node.llm</code>, ▶ Try and every run call, unless a node names its own.
          </p>
          <ProviderModelSelect
            provider={provider}
            model={model}
            onProviderChange={(next) => { setModel(modelFor(next, saved?.ai)); setProvider(next); }}
            onModelChange={setModel}
            defaultLabel={() => 'Not set (a local model that is running, else Ollama)'}
          />
          <Chosen purpose="run" provider={provider} saved={saved?.ai} probe={probe}>
            {connection(provider === 'default' ? probe?.target.provider : provider)}
          </Chosen>
        </section>

        <section>
          <h3 className="text-sm font-semibold mb-1" style={{ color: TEXT }}>AI that writes</h3>
          <p className="text-xs mb-3" style={{ color: DIM }}>
            What Auto generate, Generate all, Describe a graph and the bar under the canvas call. A larger model than the nodes need may be worth it here.
          </p>
          <ProviderModelSelect
            provider={writingProvider}
            model={writingModel}
            onProviderChange={(next) => { setWritingModel(modelFor(next, saved?.writing)); setWritingProvider(next); }}
            onModelChange={setWritingModel}
            defaultLabel={() => 'Same as the AI that runs the nodes'}
            purpose="write"
          />
          <Chosen purpose="write" provider={writingProvider} saved={saved?.writing} probe={probe}>
            {writingProvider !== 'default' && connection(writingProvider)}
          </Chosen>
        </section>

        {saved && (
          <>
            {/* Everything that can be set, for the AIs that are not chosen above. */}
            <details>
              <summary className="cursor-pointer select-none text-sm font-semibold" style={{ color: TEXT }}>All keys and server addresses</summary>
              <div className="mt-3 space-y-5">
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold" style={{ color: MUTED }}>Keys</h4>
                  {Object.keys(saved.credentials).sort((a, b) => rank(a) - rank(b)).map((id) => keyRow(id))}
                </div>
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold" style={{ color: MUTED }}>Server addresses</h4>
                  {Object.keys(saved.endpoints).map((id) => addressRow(id))}
                </div>
              </div>
            </details>

            <p className="text-xs" style={{ color: DIMMER, borderTop: `1px solid ${LINE}`, paddingTop: 12 }}>
              Stored in <span style={{ color: MUTED }} className="font-mono">{saved.settings_file}</span>.
              An environment variable of the same name wins.
            </p>
          </>
        )}

        {problem && <p className="text-xs" style={{ color: DANGER_TEXT }} role="alert">{problem}</p>}
      </div>
    </Modal>
  );
}
