import { describe, expect, it } from 'vitest';
import { absolutized, CHAPTERS, helpChapters } from './help';

describe('the help', () => {
  it('starts with getting started, then the guide chapter by chapter, in its order', () => {
    expect(CHAPTERS[0]).toMatchObject({ id: 'getting-started', title: 'Getting started' });
    const titles = CHAPTERS.map((chapter) => chapter.title);
    expect(titles).toContain('When something does not work');
    expect(titles.indexOf('The node kinds')).toBeLessThan(titles.indexOf('When something does not work'));
    expect(new Set(CHAPTERS.map((chapter) => chapter.id)).size).toBe(CHAPTERS.length);
    expect(CHAPTERS.every((chapter) => chapter.body.trim().length > 0)).toBe(true);
  });

  it('cuts at the headings of the second level, and what comes before the first is the introduction', () => {
    const cut = helpChapters('first', '# Guide\n\nintro\n\n## One\n\na\n\n### Part\n\nb\n\n## Two\n\nc');
    expect(cut.map((chapter) => chapter.title)).toEqual(['Getting started', 'The user guide', 'One', 'Two']);
    expect(cut[2].body).toContain('### Part');
  });

  it('points a link out of docs/ at the repository, where the editor has no such file', () => {
    expect(absolutized('see [the readme](../README.md) and [here](#x)'))
      .toBe('see [the readme](https://github.com/Archimedes79/Tell-and-Wire/blob/main/README.md) and [here](#x)');
    expect(CHAPTERS.some((chapter) => chapter.body.includes(']('.concat('../')))).toBe(false);
  });
});

describe('the about page', () => {
  it('is the last chapter, names the version running, and makes only the claims the README makes', () => {
    const last = CHAPTERS[CHAPTERS.length - 1];
    expect(last).toMatchObject({ id: 'about', title: 'About' });
    expect(last.body).toMatch(/^# About Tell & Wire \d+\.\d+\.\d+/);
    expect(last.body).toContain('MCP, in two ways');
    expect(last.body).toContain('source-available');
    expect(last.body.toLowerCase()).not.toContain('open source');
  });
});
