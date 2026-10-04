import { describe, it, expect, vi, afterEach } from 'vitest';
import { lent, type AiService, type ModelChoice } from '../nodes/Runtime.ts';
import { aiService, EmptyCompletionError, TimedOutError, type ProviderSettings } from './providers.ts';

/**
 * The service as a run asks it: the one AI setting -- here *provider* and
 * *model* -- filled into each request first, as `nodeRuntime` fills it.
 */
function service({ provider, model, ...settings }: Partial<ProviderSettings> & ModelChoice): AiService {
  const ai = aiService(settings);
  return { complete: (request) => ai.complete({ ...request, ...lent(request, { provider, model }) }) };
}

/** A stand-in for the network: what was asked, and what to answer. */
function stubFetch(replies: (
  { status?: number; body: unknown } | (() => { status?: number; body: unknown })
)[]) {
  const calls: { url: string; body: any; headers: Record<string, string> }[] = [];
  let index = 0;
  const fetchStub = vi.fn(async (url: string, init: any) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    const reply = replies[Math.min(index++, replies.length - 1)];
    const { status = 200, body } = typeof reply === 'function' ? reply() : reply;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
    } as Response;
  });
  vi.stubGlobal('fetch', fetchStub);
  return calls;
}

afterEach(() => { vi.unstubAllGlobals(); });

const SECRET = 'sk-secret-key';
const openAiReply = (text: string) => ({ body: { choices: [{ message: { content: text } }] } });
const anthropicReply = (text: string) => ({ body: { content: [{ type: 'text', text }] } });
const ollamaReply = (text: string) => ({ body: { message: { content: text } } });

/** A request carries its key in a header and nowhere else: not in the body, not in the URL. */
const keptSecret = (call: { url: string; body: unknown }) =>
  !call.url.includes(SECRET) && !JSON.stringify(call.body).includes(SECRET);

/**
 * A calculator, and a record of what it was asked.
 *
 * The provider layer is handed tools this way -- specs and a function -- and
 * knows nothing of where they live, so neither does the test.
 */
function calculator() {
  const asked: { name: string; args: Record<string, unknown> }[] = [];
  return {
    asked,
    specs: [{
      name: 'add',
      description: 'Add two numbers.',
      parameters: {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: { a: { type: 'number', $comment: 'first' }, b: { type: 'number' } },
        required: ['a', 'b'],
      },
    }],
    async call(name: string, args: Record<string, unknown>) {
      asked.push({ name, args });
      return String((args.a as number) + (args.b as number));
    },
  };
}

describe('the wire formats', () => {
  it('OpenAI-style: system and user as messages, the key in a header only, the answer read back', async () => {
    const calls = stubFetch([openAiReply('the answer')]);
    const ai = service({ provider: 'openai', model: 'gpt-x', apiKeys: { openai: SECRET } });

    expect(await ai.complete({ prompt: 'the question', system: 'be brief' })).toBe('the answer');
    expect(calls[0].headers.Authorization).toBe(`Bearer ${SECRET}`);
    expect(keptSecret(calls[0])).toBe(true);
    expect(calls[0].body.messages).toEqual([
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'the question' },
    ]);
  });

  it('anthropic: system beside the messages, the key in a header only, no temperature nobody asked for; tool_use out, tool_result back', async () => {
    const plain = stubFetch([anthropicReply('hello')]);
    const ai = service({ provider: 'anthropic', model: 'claude', apiKeys: { anthropic: SECRET } });
    expect(await ai.complete({ prompt: 'hi', system: 'be brief' })).toBe('hello');
    expect(plain[0].body.system).toBe('be brief');
    expect(plain[0].headers['x-api-key']).toBe(SECRET);
    expect(keptSecret(plain[0])).toBe(true);
    // Current Anthropic models refuse one.
    expect(plain[0].body).not.toHaveProperty('temperature');

    const blocks = [
      { type: 'thinking', thinking: 'I should add.', signature: 'sig' },
      { type: 'text', text: 'Let me add those.' },
      { type: 'tool_use', id: 'toolu_1', name: 'add', input: { a: 2, b: 3 } },
    ];
    const calls = stubFetch([{ body: { stop_reason: 'tool_use', content: blocks } }, anthropicReply('It is 5.')]);
    const tools = calculator();
    // The words beside the call are the model thinking aloud, not the answer.
    expect(await ai.complete({ prompt: 'what is 2+3?', tools })).toBe('It is 5.');
    expect(tools.asked).toEqual([{ name: 'add', args: { a: 2, b: 3 } }]);
    expect(calls[0].body.tools[0].input_schema.$schema).toBeUndefined();
    expect(calls[1].body.messages).toEqual([
      { role: 'user', content: 'what is 2+3?' },
      { role: 'assistant', content: blocks },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '5' }] },
    ]);
  });

  it('ollama: no streaming, message.content read back; arguments arrive as an object, the result goes back by tool name', async () => {
    const plain = stubFetch([ollamaReply('hi there')]);
    const ai = service({ provider: 'ollama', model: 'llama' });
    expect(await ai.complete({ prompt: 'hi' })).toBe('hi there');
    expect(plain[0].body.stream).toBe(false);

    const message = { role: 'assistant', content: '', tool_calls: [{ function: { name: 'add', arguments: { a: 2, b: 3 } } }] };
    const calls = stubFetch([{ body: { message } }, ollamaReply('It is 5.')]);
    const tools = calculator();
    expect(await ai.complete({ prompt: 'what is 2+3?', system: 'be brief', tools })).toBe('It is 5.');
    expect(tools.asked).toEqual([{ name: 'add', args: { a: 2, b: 3 } }]);
    expect(calls[1].body.messages).toEqual([
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'what is 2+3?' },
      message,
      { role: 'tool', content: '5', tool_name: 'add' },
    ]);
  });

  it('a picture or a PDF goes as each provider takes one', async () => {
    const picture = { prompt: 'What is in this picture?', files: ['data:image/jpeg;base64,AAAA'] };
    const statement = { prompt: 'What is the total?', files: ['data:application/pdf;base64,JVBE'] };
    const calls = stubFetch([
      anthropicReply('a barn'), ollamaReply('a barn'), openAiReply('1'), openAiReply('2'), anthropicReply('3'),
    ]);
    await service({ provider: 'anthropic', model: 'claude', apiKeys: { anthropic: 'k' } }).complete(picture);
    await service({ provider: 'ollama', model: 'llava' }).complete(picture);
    await service({ provider: 'openai', model: 'gpt', apiKeys: { openai: 'k' } }).complete(statement);
    await service({ provider: 'google', model: 'gemini', apiKeys: { google: 'k' } }).complete(statement);
    await service({ provider: 'anthropic', model: 'claude', apiKeys: { anthropic: 'k' } }).complete(statement);

    // An image block before the words; for ollama the base64, not a data URL.
    expect(calls[0].body.messages[0].content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } },
      { type: 'text', text: 'What is in this picture?' },
    ]);
    expect(calls[1].body.messages[0].images).toEqual(['AAAA']);
    // A file part to OpenAI, a data URL to Gemini, a document block to Anthropic.
    expect(calls[2].body.messages[0].content[1]).toEqual({ type: 'file', file: { filename: 'document.pdf', file_data: statement.files[0] } });
    expect(calls[3].body.messages[0].content[1]).toEqual({ type: 'image_url', image_url: { url: statement.files[0] } });
    expect(calls[4].body.messages[0].content[0]).toEqual({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'JVBE' } });
  });

  it('refuses before any request when the key or the model is missing, and lends no model from another provider', async () => {
    const calls = stubFetch([openAiReply('never asked')]);
    await expect(service({ provider: 'openai', model: 'gpt-x' }).complete({ prompt: 'x' })).rejects.toThrow(/No OpenAI API key/);
    await expect(service({ provider: 'lmstudio', model: '' }).complete({ prompt: 'x' })).rejects.toThrow(/No model configured/);
    // A node naming another provider is not given this machine's model for its own.
    await expect(service({ provider: 'google', model: 'gemini-flash', apiKeys: { openai: 'k' } }).complete({ prompt: 'x', provider: 'openai', model: '' }))
      .rejects.toThrow(/No model configured for provider 'openai'/);
    expect(calls).toHaveLength(0);
  });
});

describe('retrying', () => {
  it('goes again on an empty answer and on a busy provider, not on a refused request', async () => {
    // A local model answers "" under load, and counted as success that becomes
    // an empty output everything downstream quietly runs with.
    let calls = stubFetch([openAiReply('   '), openAiReply('second time')]);
    const ai = service({ provider: 'lmstudio', model: 'local', retryDelay: 0 });
    expect(await ai.complete({ prompt: 'x' })).toBe('second time');
    expect(calls).toHaveLength(2);

    calls = stubFetch([{ status: 503, body: { error: 'busy' } }, openAiReply('ok')]);
    expect(await ai.complete({ prompt: 'x' })).toBe('ok');
    expect(calls).toHaveLength(2);

    stubFetch([openAiReply('')]);
    await expect(service({ provider: 'lmstudio', model: 'local', retryDelay: 0, attempts: 2 }).complete({ prompt: 'x' }))
      .rejects.toBeInstanceOf(EmptyCompletionError);

    // A 400 is a configuration mistake; retrying it only makes the wait longer.
    calls = stubFetch([{ status: 400, body: { error: { message: 'model not found' } } }]);
    await expect(ai.complete({ prompt: 'x' })).rejects.toThrow(/model not found/);
    expect(calls).toHaveLength(1);
  });

  it('gives up a call that runs past the clock, says so, and does not ask the same again', async () => {
    vi.useFakeTimers();
    try {
      const asked: string[] = [];
      vi.stubGlobal('fetch', vi.fn((url: string, init: { signal: AbortSignal }) => {
        asked.push(url);
        return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('This operation was aborted', 'AbortError'))));
      }));
      const asking = service({ provider: 'lmstudio', model: 'local', retryDelay: 0, timeoutMs: 60_000 }).complete({ prompt: 'x' });
      const failed = expect(asking).rejects.toBeInstanceOf(TimedOutError);
      await vi.advanceTimersByTimeAsync(60_000);
      await failed;
      expect(asked).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the tool loop, in OpenAI\'s dialect', () => {
  // As Gemini 3 sends it through the OpenAI-compatible endpoint: a thought
  // signature on the call, which it wants back on the next turn.
  const toolCall = {
    id: 'call_1',
    type: 'function',
    function: { name: 'add', arguments: '{"a":2,"b":3}' },
    extra_content: { google: { thought_signature: 'sig-abc' } },
  };
  const asksForAdd = { body: { choices: [{ message: { role: 'assistant', content: null, tool_calls: [toolCall] } }] } };

  it('offers the tools, runs the call, echoes the assistant message exactly, and answers with what the model says next', async () => {
    const calls = stubFetch([asksForAdd, openAiReply('It is 5.')]);
    const tools = calculator();
    const ai = service({ provider: 'lmstudio', model: 'local' });

    expect(await ai.complete({ prompt: 'what is 2+3?', system: 'be brief', tools })).toBe('It is 5.');
    expect(tools.asked).toEqual([{ name: 'add', args: { a: 2, b: 3 } }]);
    // Schema noise stripped from what is offered.
    expect(calls[0].body.tools[0].function.parameters).toEqual({
      type: 'object',
      properties: { a: { type: 'number' }, b: { type: 'number' } },
      required: ['a', 'b'],
    });
    // Rebuilt from the fields understood here, the message would lose the
    // signature -- and Gemini 3 answers the second turn with a 400.
    expect(calls[1].body.messages).toEqual([
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'what is 2+3?' },
      { role: 'assistant', content: null, tool_calls: [toolCall] },
      { role: 'tool', tool_call_id: 'call_1', content: '5' },
    ]);
  });

  it('tells the model of a bad call instead of failing the run, and stops after eight rounds', async () => {
    const tools = {
      specs: [{ name: 'ping', description: '', parameters: {} }, ...calculator().specs],
      call: vi.fn(async (name: string) => (name === 'ping' ? 'pong' : '5')),
    };
    const calls = stubFetch([
      { body: { choices: [{ message: { content: null, tool_calls: [
        { id: 'a', type: 'function', function: { name: 'ping', arguments: '' } },
        { id: 'b', type: 'function', function: { name: 'rm_rf', arguments: '{}' } },
        { id: 'c', type: 'function', function: { name: 'add', arguments: '{"a": 2, "b":' } },
      ] } }] } },
      openAiReply('done'),
    ]);
    const ai = service({ provider: 'lmstudio', model: 'local' });
    await ai.complete({ prompt: 'x', tools });

    // No arguments at all is none; a tool never offered and broken JSON are mistakes to report, not to run.
    expect(tools.call).toHaveBeenCalledTimes(1);
    expect(tools.call).toHaveBeenCalledWith('ping', {}, undefined);
    const [first, second, third] = calls[1].body.messages.slice(-3);
    expect(first).toEqual({ role: 'tool', tool_call_id: 'a', content: 'pong' });
    expect(second.content).toMatch(/^Tool error: there is no tool named "rm_rf"/);
    expect(third.content).toMatch(/^Tool error: the arguments were not valid JSON/);

    // A model that will not stop calling is asked for an answer with the tools withdrawn.
    const looping = stubFetch([...Array(8).fill(asksForAdd), openAiReply('From what I have: 5.')]);
    const adder = calculator();
    expect(await ai.complete({ prompt: 'x', tools: adder })).toBe('From what I have: 5.');
    expect(adder.asked).toHaveLength(8);
    expect(looping[7].body.tool_choice).toBeUndefined();
    expect(looping[8].body.tool_choice).toBe('none');
    // ...and when it still will not, the run fails, clearly.
    stubFetch([asksForAdd]);
    await expect(ai.complete({ prompt: 'x', tools: calculator() })).rejects.toThrow(/still calling tools after 8 rounds/);
  });
});
