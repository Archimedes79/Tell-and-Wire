import { describe, expect, it } from 'vitest';
import { editorLink, projectAsked } from './links';

describe('the link to the graph editor', () => {
  it('names the project, whatever is in its path, and is read back from the address it makes', () => {
    const link = editorLink('/work/My tools/a&b #1', { protocol: 'http:', hostname: '127.0.0.1' });
    expect(link).toBe('http://127.0.0.1:8000/?open=%2Fwork%2FMy%20tools%2Fa%26b%20%231');
    expect(projectAsked(new URL(link).search)).toBe('/work/My tools/a&b #1');
    expect(projectAsked('')).toBeNull();
    expect(projectAsked('?open=%20')).toBeNull();
  });
});
