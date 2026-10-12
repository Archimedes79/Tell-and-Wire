import { beforeEach, describe, expect, it } from 'vitest';
import { parseSaid, say, useNotices } from './noticeBoard';

const keys = () => useNotices.getState().notices.map((notice) => notice.key);

describe('what the editor says', () => {
  beforeEach(() => useNotices.setState({ notices: [] }));

  it('takes the level from the mark a line starts with, and drops the mark', () => {
    expect(parseSaid('✅ Saved to x')).toEqual({ level: 'done', text: 'Saved to x' });
    expect(parseSaid('❌ Save failed')).toEqual({ level: 'error', text: 'Save failed' });
    expect(parseSaid('⚠ Left out a wire')).toEqual({ level: 'warning', text: 'Left out a wire' });
    expect(parseSaid('⚠️ Stopped at a')).toEqual({ level: 'warning', text: 'Stopped at a' });
    expect(parseSaid('↻ From disk: a')).toEqual({ level: 'info', text: 'From disk: a' });
    expect(parseSaid('Nothing to generate.')).toEqual({ level: 'info', text: 'Nothing to generate.' });
  });

  it('is replaced by the next of its key, and taken away by an empty one', () => {
    say('file', 'Saving…');
    say('file', '✅ Saved to x');
    expect(useNotices.getState().notices).toMatchObject([{ key: 'file', level: 'done', text: 'Saved to x' }]);
    say('file', '');
    expect(keys()).toEqual([]);
  });

  it('keeps what is going on, and a problem, until it is read -- what went well goes by itself', () => {
    say('a', 'Saving…');
    say('b', '✅ Opened x');
    say('c', '❌ Failed');
    expect(useNotices.getState().notices.map((notice) => notice.sticky)).toEqual([true, false, true]);
  });

  it('shows four at most, and lets go of what went well before a problem', () => {
    say('error', '❌ Failed');
    say('a', '✅ one');
    say('b', '✅ two');
    say('c', '✅ three');
    say('d', '✅ four');
    expect(keys()).toEqual(['error', 'b', 'c', 'd']);
  });
});
