import { describe, it, expect } from 'vitest';
import {
  addInput, addOutput, addStep, addWindow, blankPage, freshName, kindOfOutput, moveCell, removeCell, removeWindow, renameInput, renameStep, repoint,
} from '../../gui/notebook/edit.ts';
import { windowProblems, windowsToGraph, type Windows } from '../../gui/notebook/windows.ts';
import { problemsIn } from '../../gui/editor/check.ts';

/**
 * The edits of the notebook's buttons: each returns a new document, and the document is still one that
 * becomes a graph that works -- the buttons cannot be used to make a window that does not.
 */

const page = (): Windows => {
  const first = addWindow({ name: 'Texts', description: '', windows: [] }, 'Summarize');
  return first;
};

describe('editing windows', () => {
  it('starts a page with a window that already works', () => {
    const doc = blankPage('Tool');
    expect(doc.windows).toHaveLength(1);
    expect(windowProblems(doc)).toEqual([]);
    expect(problemsIn(windowsToGraph(doc))).toEqual([]);
  });

  it('adds inputs, cells and outputs under names that do not collide, and every edit leaves its argument alone', () => {
    const doc = page();
    const before = JSON.stringify(doc);
    const id = doc.windows[0].id;
    let next = addInput(doc, id, 'text');
    next = addInput(next, id, 'text');
    next = addStep(next, id);
    next = addStep(next, id);
    next = addOutput(next, id, 'chart');
    next = addOutput(next, id, 'chart');
    expect(JSON.stringify(doc)).toBe(before);
    const window = next.windows[0];
    expect(window.inputs.map((one) => one.name)).toEqual(['Text', 'Text 2', 'Text 3']);
    expect(new Set(window.outputs.map((one) => one.name)).size).toBe(3);
    // Nothing of what the buttons made is a problem: a new cell mentions what is before it.
    expect(windowProblems(next)).toEqual([]);
    expect(problemsIn(windowsToGraph(next))).toEqual([]);
  });

  it('renames an input and the sentences that point at it, and not a longer name that starts alike', () => {
    expect(repoint('Summarize @Text and @Text2 in @Text.path', 'Text', 'The text')).toBe('Summarize @The_text and @Text2 in @The_text.path');
    const doc = renameInput(page(), 'summarize', 0, 'Story text');
    expect(doc.windows[0].steps[0].sentence).toBe('Say it more simply: @Story_text');
    expect(windowProblems(doc)).toEqual([]);
  });

  it('renames a cell and what points at it: the later sentences and the output that shows it', () => {
    let doc = addStep(page(), 'summarize');
    doc = renameStep(doc, 'summarize', 0, 'Simple');
    expect(doc.windows[0].steps[1].sentence).toBe('Continue with @Simple');
    expect(doc.windows[0].outputs[0]).toMatchObject({ of: 'Simple', name: 'Simple' });
    expect(windowProblems(doc)).toEqual([]);
  });

  it('moves and removes cells, and a window that other windows take from takes its leaving with them', () => {
    let doc = addStep(page(), 'summarize');
    const [a, b] = doc.windows[0].steps.map((step) => step.name);
    doc = moveCell(doc, 'summarize', { list: 'steps', at: 1 }, -1);
    expect(doc.windows[0].steps.map((step) => step.name)).toEqual([b, a]);
    expect(moveCell(doc, 'summarize', { list: 'steps', at: 0 }, -1)).toEqual(doc);
    doc = removeCell(doc, 'summarize', { list: 'steps', at: 0 });
    expect(doc.windows[0].steps).toHaveLength(1);

    let two = addWindow(page(), 'English');
    two = addInput(two, 'english', 'from');
    expect(two.windows[1].inputs.at(-1)!.from).toEqual({ window: 'summarize', output: 'Result' });
    expect(removeWindow(two, 'summarize').windows[0].inputs.some((one) => one.kind === 'from')).toBe(false);
  });

  it('gives an output of another kind the height of that kind, and names windows apart', () => {
    const doc = kindOfOutput(page(), 'summarize', 0, 'chart');
    expect(doc.windows[0].outputs[0]).toMatchObject({ kind: 'chart', rows: 5 });
    expect(addWindow(addWindow(page(), 'Summarize'), 'Summarize').windows.map((window) => window.id)).toEqual(['summarize', 'summarize_2', 'summarize_3']);
    expect(freshName('Result', ['result'])).toBe('Result 2');
  });
});

describe('a cell done by code', () => {
  it('starts with code that runs as it is, keeps what was written when switched to a model and back, and is a problem while it is empty', async () => {
    const { Session } = await import('../deployment/host/session.ts');
    const { guiHooks } = await import('../deployment/gui/hooks.ts');
    const { quietRuntime } = await import('../deployment/runtime/test/fakes.ts');
    const { setHow, seedCode, patchStep } = await import('../../gui/notebook/edit.ts');

    let doc = addStep(page(), 'summarize', 'code');
    const step = doc.windows[0].steps[1];
    expect(step.how).toBe('code');
    expect(step.code).toBe(seedCode(doc.windows[0], 1));
    expect(windowProblems(doc)).toEqual([]);

    // Run: the new cell takes what comes right before it (the first cell's answer) and hands it on.
    const runtime = () => quietRuntime({
      ai: { complete: async () => 'a plain answer' },
      code: { run: async (body, inputs) => ({ code: String(Object.values(inputs).join('|')), body }) },
    });
    const made = windowsToGraph(doc);
    expect(problemsIn(made)).toEqual([]);
    const session = await Session.open(made, { runtime, gui: guiHooks });
    const result = await session.run({ node_id: 'summarize', port_id: 'data' }, { by: 'summarize_run' });
    expect(result.status).toBe('success');

    // Kept across a switch, and a switch to a model does not erase it.
    doc = patchStep(doc, 'summarize', 1, { code: 'function run(inputs) { return { code: 1 }; }' });
    doc = setHow(setHow(doc, 'summarize', 1, 'ai'), 'summarize', 1, 'code');
    expect(doc.windows[0].steps[1].code).toBe('function run(inputs) { return { code: 1 }; }');
    expect(windowProblems(patchStep(doc, 'summarize', 1, { code: '  ' })).map((one) => one.problem)).toEqual(['The cell "Code" is code and holds none yet.']);
  });
});

describe('a window that is a chat', () => {
  const CHAT: Windows = {
    name: 'Chat', description: '',
    windows: [{
      id: 'talk', title: 'Talk', span: 12, inputs: [],
      steps: [{ name: 'Reply', sentence: 'Answer @Chat.message, knowing @Chat.history.', how: 'ai' }],
      outputs: [{ name: 'Chat', kind: 'chat', rows: 7 }],
    }],
  };

  it('is a graph that works, with one box that sends and shows, and no button', async () => {
    expect(windowProblems(CHAT)).toEqual([]);
    const graph = windowsToGraph(CHAT);
    expect(problemsIn(graph)).toEqual([]);
    const blocks = graph.gui!.blocks as unknown as Record<string, unknown>[];
    expect(blocks.filter((block) => block.group === 'talk').map((block) => block.kind)).toEqual(['text', 'chat']);
    expect(blocks.find((block) => block.kind === 'chat')).toMatchObject({ id: 'talk_out_chat', sends_to: ['talk'], fires: 'talk', shows: 'talk_out_chat' });
    const step = graph.nodes.find((node) => node.id === 'talk_reply')!;
    expect(step.inputs.map((one) => [one.id, (one as { field?: string }).field])).toEqual([['chat_message', 'talk_out_chat.message'], ['chat_history', 'talk_out_chat.history']]);
  });

  it('answers, and the second message is sent with what was said before it', async () => {
    const { Session } = await import('../deployment/host/session.ts');
    const { guiHooks } = await import('../deployment/gui/hooks.ts');
    const { quietRuntime } = await import('../deployment/runtime/test/fakes.ts');
    const asked: string[] = [];
    const runtime = () => quietRuntime({ ai: { complete: async (request) => { asked.push(JSON.stringify(request)); return `answer ${asked.length}`; } } });
    const session = await Session.open(windowsToGraph(CHAT), { runtime, gui: guiHooks });

    await session.run({ node_id: 'talk', port_id: 'data' }, { by: 'talk_out_chat', values: { talk_out_chat: { messages: [], pending: 'first question' } } });
    const said = (session.view().gui.talk_out_chat as { messages: { role: string; text: string }[] }).messages;
    expect(said).toEqual([{ role: 'user', text: 'first question' }, { role: 'assistant', text: 'answer 1' }]);

    await session.run({ node_id: 'talk', port_id: 'data' }, { by: 'talk_out_chat', values: { talk_out_chat: { messages: said, pending: 'second question' } } });
    expect(asked[1]).toContain('second question');
    expect(asked[1]).toContain('first question');
    expect(asked[1]).toContain('answer 1');
  });
});
