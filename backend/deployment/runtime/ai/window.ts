// How much a model takes in at once, and where that is known from.
//
// Asked in this order, because each answer is better than the next: what the person set (`context_tokens` in the settings file, or
// `TW_CONTEXT_TOKENS`), what the provider says of the model, and last a guess that errs small -- said as a guess, so that a counter built on
// it can say so. Providers that tell: Anthropic (`max_input_tokens`) and Google (`inputTokenLimit`). OpenAI and the rest do not, and a
// local model runs with a window of its own choosing that no list of models gives (an Ollama model is loaded with far less than it was
// trained for), so for those the number is the person's or a guess.

import { configuredSettings, readSettingsFile, settingsPath, LOCAL_PROVIDERS } from './settings.ts';
import type { ModelChoice } from '../../../../graph/nodes/Runtime.ts';

/** Where a window comes from: the person, the provider, or a guess. */
export type WindowSource = 'set' | 'provider' | 'assumed';

export interface ContextWindow extends ModelChoice {
  tokens: number;
  source: WindowSource;
}

/** What a hosted model that does not say is taken to hold: less than most of today's, more than any old one. */
const HOSTED_GUESS = 128_000;
/** What a local one is taken to hold: its server's default is usually this or less. */
const LOCAL_GUESS = 8_000;

type Env = Record<string, string | undefined>;

const known = new Map<string, number>();
const asked = (choice: ModelChoice): string => `${choice.provider}/${choice.model}`;

/** A positive whole number of tokens, or nothing. */
function tokens(raw: unknown): number | undefined {
  const count = typeof raw === 'string' ? Number(raw.replace(/[\s_,]/g, '')) : raw;
  return typeof count === 'number' && Number.isInteger(count) && count >= 1000 ? count : undefined;
}

/** What the provider says of *choice*, if it is one that does and has been given a key. */
async function fromProvider(choice: ModelChoice, env: Env, cwd: string, fetcher: typeof fetch): Promise<number | undefined> {
  const { apiKeys = {}, endpoints = {} } = configuredSettings(env, cwd);
  const name = encodeURIComponent(choice.model.replace(/^models\//, ''));
  try {
    if (choice.provider === 'anthropic' && apiKeys.anthropic) {
      const base = (endpoints.anthropic ?? 'https://api.anthropic.com/v1').replace(/\/+$/, '');
      const reply = await fetcher(`${base}/models/${name}`, { headers: { 'x-api-key': apiKeys.anthropic, 'anthropic-version': '2023-06-01' }, signal: AbortSignal.timeout(4000) });
      return reply.ok ? tokens(((await reply.json()) as { max_input_tokens?: unknown }).max_input_tokens) : undefined;
    }
    if (choice.provider === 'google' && apiKeys.google) {
      // The tool talks to Google's OpenAI-style address; the model's own description is one level up.
      const base = (endpoints.google ?? 'https://generativelanguage.googleapis.com/v1beta/openai').replace(/\/+$/, '').replace(/\/openai$/, '');
      const reply = await fetcher(`${base}/models/${name}`, { headers: { 'x-goog-api-key': apiKeys.google }, signal: AbortSignal.timeout(4000) });
      return reply.ok ? tokens(((await reply.json()) as { inputTokenLimit?: unknown }).inputTokenLimit) : undefined;
    }
  } catch {
    // Not reachable, or not a model it knows: no answer is the answer, and the guess stands.
  }
  return undefined;
}

/**
 * The window of *choice*, and where the number comes from. Asked of the provider once per model and process; a failed ask is made again
 * the next time, so a key saved a minute ago is tried.
 */
export async function contextWindow(
  choice: ModelChoice,
  { cwd = process.cwd(), env = process.env as Env, fetcher = fetch }: { cwd?: string; env?: Env; fetcher?: typeof fetch } = {},
): Promise<ContextWindow> {
  const set = tokens(env.TW_CONTEXT_TOKENS) ?? tokens(readSettingsFile(settingsPath(cwd, env)).context_tokens);
  if (set) return { ...choice, tokens: set, source: 'set' };
  const remembered = known.get(asked(choice));
  const said = remembered ?? (choice.model ? await fromProvider(choice, env, cwd, fetcher) : undefined);
  if (said) {
    known.set(asked(choice), said);
    return { ...choice, tokens: said, source: 'provider' };
  }
  const local = (LOCAL_PROVIDERS as readonly string[]).includes(choice.provider);
  return { ...choice, tokens: local ? LOCAL_GUESS : HOSTED_GUESS, source: 'assumed' };
}
