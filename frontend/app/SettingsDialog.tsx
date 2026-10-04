import { useEffect, useState } from 'react';
import type { AIProvider } from './graph';
import { call, type SettingsPatch, type SettingsStatus } from './api/client';
import { errorText } from './api/errorText';
import ProviderModelSelect, { AI_PROVIDER_LABELS, nowText, refreshProviderStatus, useProviderStatus } from './fields/ProviderModelSelect';
import Modal from './ui/Modal';
import Button from './ui/Button';
import { DEFAULT_SETTINGS } from '../../graph/ai/providers.ts';
import { ACCENT_FILL, ACCENT_TEXT, DANGER_TEXT, DIM, DIMMER, FIELD, LINE, MUTED, SUCCESS, TEXT } from './ui/theme';

/** Where each provider's key comes from, said where the key is typed. */
const KEY_HINTS: Record<string, string> = {
  openai: 'From platform.openai.com',
  anthropic: 'From console.anthropic.com',
  google: 'Free key from aistudio.google.com/apikey',
  github_copilot: 'A GitHub token with the models:read scope',
  openai_compatible: 'Whatever your endpoint expects',
};

const label = (id: string): string => AI_PROVIDER_LABELS[id as AIProvider] ?? id;

/**
 * The AI the tool asks and what it needs to ask it, as one form with one Save:
 * the provider and model that ✨, ▶ Try and every run call wherever a node
 * names none, the keys, and the servers' addresses. This machine's, saved in
 * `ai-settings.json` and never in a graph, so a graph handed to someone else
 * runs on whatever they chose.
 *
 * Keys are write-only by design: the server reports whether one is set and
 * where it came from, never its value, so a key never travels back into the
 * browser. The rows are what the backend's status names (`CREDENTIALS`,
 * `ENDPOINT_ENV` in `graph/ai/providers.ts`), not a list of their own.
 *
 * "Now" is the backend's answer (`providers`), not worked out here: it is what
 * a run will call, environment and all.
 */
export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const probe = useProviderStatus();
  const [saved, setSaved] = useState<SettingsStatus | null>(null);
  const [provider, setProvider] = useState<AIProvider>('default');
  const [model, setModel] = useState('');
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
      setEndpoints(data.endpoints);
    }).catch((error) => setProblem(errorText(error, 'Could not read the AI settings file.')));
  }, []);

  const typedKeys = Object.fromEntries(Object.entries(keys).map(([id, key]) => [id, key.trim()]).filter(([, key]) => key));
  const changed = saved !== null && (
    provider !== (saved.ai.provider || 'default') || model !== saved.ai.model
    || Object.keys(saved.endpoints).some((id) => (endpoints[id] ?? '') !== saved.endpoints[id])
    || Object.keys(typedKeys).length > 0 || removing.length > 0
  );

  const save = async () => {
    const patch: SettingsPatch = { ai: { provider, model }, endpoints, api_keys: typedKeys, clear_keys: removing };
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
          <h3 className="text-sm font-semibold mb-1" style={{ color: TEXT }}>AI</h3>
          <p className="text-xs mb-3" style={{ color: DIM }}>
            What ✨, ▶ Try and every run call, unless a node names its own.
          </p>
          <ProviderModelSelect
            provider={provider}
            model={model}
            onProviderChange={setProvider}
            onModelChange={setModel}
            defaultLabel={() => 'Not set (a local model that is running, else Ollama)'}
          />
          <p className="text-xs mt-3" style={{ color: DIM }}>Now: <strong style={{ color: TEXT }}>{nowText(probe)}</strong></p>
          {saved && saved.ai.environment.length > 0 && (
            <div className="text-xs rounded-lg px-3 py-2 mt-3" style={{ background: ACCENT_FILL, color: ACCENT_TEXT }}>
              {saved.ai.environment.map((variable, i) => <span key={variable}>{i > 0 && ' and '}<code>{variable}</code></span>)}{' '}
              {saved.ai.environment.length > 1 ? 'are' : 'is'} set where the editor was started and wins over what is saved here.
            </div>
          )}
        </section>

        {saved && (
          <>
            <section>
              <h3 className="text-sm font-semibold mb-2" style={{ color: TEXT }}>Keys</h3>
              <div className="space-y-2">
                {Object.keys(saved.credentials).map((id) => {
                  const state = saved.credentials[id];
                  const going = removing.includes(id);
                  return (
                    <div key={id} className="flex items-center gap-2">
                      <div className="w-36 shrink-0">
                        <div className="text-xs font-medium" style={{ color: TEXT }}>{label(id)}</div>
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
                })}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-semibold mb-2" style={{ color: TEXT }}>Server addresses</h3>
              <div className="space-y-2">
                {Object.keys(saved.endpoints).map((id) => (
                  <div key={id} className="flex items-center gap-2">
                    <label htmlFor={`address-${id}`} className="w-36 shrink-0 text-xs font-medium" style={{ color: TEXT }}>{label(id)}</label>
                    <input
                      id={`address-${id}`}
                      className="flex-1 min-w-0 rounded-lg px-2 py-1.5 text-sm font-mono"
                      style={FIELD}
                      value={endpoints[id] ?? ''}
                      onChange={(e) => setEndpoints((now) => ({ ...now, [id]: e.target.value }))}
                      placeholder={DEFAULT_SETTINGS.endpoints[id] || 'https://my-endpoint.example.com/v1'}
                    />
                  </div>
                ))}
              </div>
            </section>

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
