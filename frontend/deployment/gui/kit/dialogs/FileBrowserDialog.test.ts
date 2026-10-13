import { describe, expect, it } from 'vitest';
import { nameProblem } from './FileBrowserDialog';

describe('a name to save a tool under', () => {
  it('may be plain words, with spaces and accents, and is checked only once there is something typed', () => {
    for (const fine of ['', '  ', 'my_tool', 'My Great Tool', 'café tool', 'tool.json', 'sub/tool']) expect(nameProblem(fine), fine).toBe('');
  });

  it('is refused where it is a folder step or holds a mark no file system takes', () => {
    for (const bad of ['..', '.', '../x', 'a/../b', 'a\\..\\b', 'a:b', 'what?', 'a|b', 'a"b', 'star*']) expect(nameProblem(bad), bad).not.toBe('');
  });
});
