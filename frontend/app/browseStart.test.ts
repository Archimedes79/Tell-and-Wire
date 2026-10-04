import { describe, expect, it } from 'vitest';
import { browseStart, folderOf } from './browseStart';

describe('where the file browser opens', () => {
  it('saves a saved project again beside itself, under its own name -- not inside it', () => {
    // Rebuilt by hand: Save as on a saved project opened the browser inside
    // the project's folder, and "Save here" nested a project in the project.
    expect(browseStart('save', 'D:\\tools\\word_stats', 'D:\\elsewhere', 'stats')).toEqual({ initialPath: 'D:\\tools', defaultName: 'word_stats' });
    expect(browseStart('save', '/home/me/tools/one.json', '', 'one')).toEqual({ initialPath: '/home/me/tools', defaultName: 'one.json' });
  });

  it('opens a bare name in the folder last used, named so, and a graph to open where it is', () => {
    expect(browseStart('save', 'my_graph', 'D:\\tools', 'x')).toEqual({ initialPath: 'D:\\tools', defaultName: 'my_graph' });
    expect(browseStart('save', '', 'D:\\tools', 'untitled')).toEqual({ initialPath: 'D:\\tools', defaultName: 'untitled' });
    expect(browseStart('load', 'D:\\tools\\word_stats', 'D:\\tools', 'x').initialPath).toBe('D:\\tools\\word_stats');
  });

  it('finds the folder a path is in', () => {
    expect(folderOf('D:\\tools\\word_stats\\')).toBe('D:\\tools');
    expect(folderOf('/a/b.json')).toBe('/a');
    expect(folderOf('bare')).toBe('');
  });
});
