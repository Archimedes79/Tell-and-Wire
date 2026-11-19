import { describe, it, expect } from 'vitest';
import { paramProblems, paramsOf, usageOf, valuesFromFlags, type Param } from './params.ts';

const call = (params: unknown) => ({ config: { started_by: 'call', params } }) as never;

describe('the parameters of a start point', () => {
  it('are those a call-started start point declares, well formed, in order -- and none for a start point the GUI starts', () => {
    const declared = [
      { name: 'text', type: 'text', required: true, description: ' One sentence. ' },
      { name: 'words', type: 'number', default: '20' },
      { name: 'loud', type: 'flag' },
      { name: 'odd', type: 'weird' },
      { type: 'text' },
      'nonsense',
    ];
    expect(paramsOf(call(declared))).toEqual([
      { name: 'text', type: 'text', required: true, description: 'One sentence.' },
      { name: 'words', type: 'number', default: '20' },
      { name: 'loud', type: 'flag' },
      { name: 'odd', type: 'text' },
    ]);
    expect(paramsOf({ config: { started_by: 'gui', params: declared } } as never)).toEqual([]);
    expect(paramsOf(call('not a list'))).toEqual([]);
  });

  it('are said when they cannot be typed: a name with a space or a capital, the command line\'s own, twice, a default that is not its kind', () => {
    const params: Param[] = [
      { name: 'Two Words', type: 'text' }, { name: 'port', type: 'text' }, { name: 'a', type: 'text' }, { name: 'a', type: 'text' },
      { name: 'n', type: 'number', default: 'x' }, { name: 'f', type: 'flag', default: 'maybe' }, { name: 'r', type: 'text', required: true, default: 'z' },
    ];
    const said = paramProblems(params).join('\n');
    expect(said).toMatch(/"Two Words" cannot be typed as --Two Words/);
    expect(said).toMatch(/--port is the command line's own/);
    expect(said).toMatch(/"a" is declared twice/);
    expect(said).toMatch(/default of "n" is not a number/);
    expect(said).toMatch(/default of "f" is a flag/);
    expect(said).toMatch(/"r" is required and has a default/);
    expect(paramProblems([{ name: 'text', type: 'text' }, { name: 'words-max', type: 'number', default: '3' }])).toEqual([]);
  });
});

describe('what was typed on the command line', () => {
  const params: Param[] = [
    { name: 'text', type: 'text', required: true }, { name: 'words', type: 'number', default: '20' },
    { name: 'loud', type: 'flag' }, { name: 'note', type: 'text' },
  ];

  it('becomes the values: typed, with the defaults where nothing was said, a flag false unless given, and nothing for what has neither', () => {
    expect(valuesFromFlags(params, { text: 'hi', words: '5', loud: true })).toEqual({ text: 'hi', words: 5, loud: true });
    expect(valuesFromFlags(params, { text: 'hi' })).toEqual({ text: 'hi', words: 20, loud: false });
    expect(valuesFromFlags(params, { text: 'hi', loud: 'false', note: 'n' })).toEqual({ text: 'hi', words: 20, loud: false, note: 'n' });
  });

  it('is refused in a sentence: a name that is none, a value of the wrong kind, a value missing, a required parameter not given', () => {
    expect(() => valuesFromFlags(params, { text: 'hi', nope: '1' })).toThrow(/Unknown option "--nope". This tool takes --text, --words, --loud, --note/);
    expect(() => valuesFromFlags(params, { text: 'hi', words: 'many' })).toThrow(/--words wants a number, not "many"/);
    expect(() => valuesFromFlags(params, { text: 'hi', words: true })).toThrow(/--words wants a value/);
    expect(() => valuesFromFlags(params, { text: 'hi', loud: 'yes' })).toThrow(/--loud is a flag/);
    expect(() => valuesFromFlags(params, {})).toThrow(/Missing --text: it is required/);
    expect(() => valuesFromFlags([], { x: '1' })).toThrow(/This tool takes none/);
  });

  it('is told by --help: the tool, how to run it, each parameter aligned with its kind, default and sentence', () => {
    const said = usageOf({ name: 'Shout', description: 'Says it louder.', command: 'node backend/cli/main.ts shout', params: [
      { ...params[0], description: 'What to say.' }, params[1], params[2],
    ] });
    expect(said).toContain('Shout\nSays it louder.');
    expect(said).toContain('Usage: node backend/cli/main.ts shout --text … [options]');
    expect(said).toContain('--text <text>');
    expect(said).toMatch(/--words <number> {2}\(default 20\)/);
    expect(said).toContain('What to say. (required)');
    expect(said).toContain('A text of - is read from standard input');
  });
});
