import { describe, expect, it } from 'vitest';
import { notebookLink, projectAsked } from './notebookLink';

describe('the link to the notebook', () => {
  it('names the project and is read back from the address it makes', () => {
    const link = notebookLink('/work/my tool', { protocol: 'http:', hostname: 'localhost' });
    expect(link).toBe('http://localhost:8100/?open=%2Fwork%2Fmy%20tool');
    expect(projectAsked(new URL(link).search)).toBe('/work/my tool');
    expect(projectAsked('?x=1')).toBeNull();
  });
});
