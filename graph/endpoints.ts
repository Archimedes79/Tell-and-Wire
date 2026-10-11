// Where each model provider is, unless a person says otherwise.
//
// Here and not with the provider clients (`backend/deployment/runtime/ai/providers.ts`), so that the
// editor's settings dialog can show them without carrying the clients.

export const DEFAULT_ENDPOINTS: Record<string, string> = {
  ollama: 'http://localhost:11434',
  lmstudio: 'http://localhost:1234/v1',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai',
  github_copilot: 'https://models.github.ai/inference',
  openai_compatible: '',
};
