import { describe, expect, it } from 'vitest';
import type { Graph } from '../../../graph/graph.ts';
import { edge, graphOf, node, quietRuntime } from '../runtime/test/fakes.ts';
import { guiHooks } from '../gui/hooks.ts';
import { compacted, toFold } from '../../../gui/widgets/chat/compact.ts';
import { chatValue, type ChatMessage } from '../../../gui/widgets/chat/value.ts';
import { BadChat, chatContext, compactChat } from './chat.ts';
import { Session } from './session.ts';

const chatbot: Graph = {
  ...graphOf(
    [
      node('send', 'start'),
      node('ai', 'ai', { ai_model: 'm' }, { in: ['history:chat.history', 'message:chat.message'], out: ['output'] }),
      node('reply', 'end', {}, { in: ['value'] }),
    ],
    [edge('h', 'send', 'data', 'ai', 'history'), edge('m', 'send', 'data', 'ai', 'message'), edge('r', 'ai', 'output', 'reply', 'value')],
  ),
  gui: { blocks: [{ id: 'chat', kind: 'chat', sends_to: ['send'], fires: 'send', shows: 'reply' }] },
};

/** A chat tool whose model answers every question with "ok" and every request to shorten with a summary. */
async function tool() {
  const asked: { system?: string; prompt: string }[] = [];
  const session = await Session.open(chatbot, {
    gui: guiHooks,
    runtime: (report) => quietRuntime({
      report,
      ai: {
        complete: async (request) => {
          asked.push(request);
          return request.system?.includes('shorten') ? 'SUMMARY of the early turns' : 'ok';
        },
        setting: async () => ({ provider: 'openai', model: 'm' }),
      },
    }),
  });
  return { session, asked };
}

describe('a chat block asks the model besides a round', () => {
  it('shortens the oldest turns with one call, and sends the summary with the next message', async () => {
    const { session, asked } = await tool();
    const say = (chat: unknown) => session.run({ node_id: 'send', port_id: 'data' }, { values: { chat }, by: 'chat' });
    let chat = chatValue({});
    for (let at = 1; at <= 4; at += 1) {
      await say({ ...chat, pending: `question ${at}` });
      chat = chatValue(session.view().gui.chat);
    }
    expect(chat.messages).toHaveLength(8);
    const asking = asked.length;

    const { fold, upTo } = toFold(chat)!;
    const { summary } = await compactChat(session, { summary: chat.summary, messages: fold });
    expect(asked).toHaveLength(asking + 1);
    expect(asked.at(-1)!.prompt).toContain('User: question 1');
    expect(asked.at(-1)!.prompt).not.toContain('question 3');

    chat = compacted(chat, summary, upTo);
    await say({ ...chat, pending: 'question 5' });
    const sent = asked.at(-1)!.prompt;
    expect(sent).toContain('SUMMARY of the early turns');
    expect(sent).not.toContain('question 1');
    expect(sent).toContain('User: question 3');
    // The reply joined the conversation, and what was folded stays folded and on show.
    const after = chatValue(session.view().gui.chat);
    expect(after.messages).toHaveLength(10);
    expect(after).toMatchObject({ summary: 'SUMMARY of the early turns', folded: 4 });
  });

  it('says the window of the model the tool runs on', async () => {
    const { session } = await tool();
    expect(await chatContext(session)).toMatchObject({ provider: 'openai', model: 'm', tokens: expect.any(Number), source: expect.stringMatching(/^(set|provider|assumed)$/) });
  });

  it('refuses what is no conversation, and an answer of nothing', async () => {
    const { session } = await tool();
    await expect(compactChat(session, { messages: [] })).rejects.toBeInstanceOf(BadChat);
    await expect(compactChat(session, { messages: [{ role: 'robot', text: 'x' }] })).rejects.toBeInstanceOf(BadChat);
    await expect(compactChat(session, { messages: 'x' })).rejects.toBeInstanceOf(BadChat);
    const turn: ChatMessage = { role: 'user', text: 'x'.repeat(2_100_000) };
    await expect(compactChat(session, { messages: [turn] })).rejects.toThrow(/more than a model/);

    const mute = await Session.open(chatbot, { gui: guiHooks, runtime: (report) => quietRuntime({ report, ai: { complete: async () => '  ' } }) });
    await expect(compactChat(mute, { messages: [{ role: 'user', text: 'hi' }] })).rejects.toThrow(/nothing was shortened/);
  });
});
