import { describe, it, expect } from 'vitest';
import { SENT_WITH, STANDARD_PROMPTS } from './prompts.ts';

/** What every chat sends with what the person says: the same four facts, whatever kind of node it writes for. */

describe('the standard prompts', () => {
  it('each name the node\'s text, its input, its output and the graph around it', () => {
    for (const [kind, prompt] of Object.entries(STANDARD_PROMPTS)) {
      for (const variable of Object.keys(SENT_WITH)) expect(prompt, `${kind} names {${variable}}`).toContain(`{${variable}}`);
    }
  });
});
