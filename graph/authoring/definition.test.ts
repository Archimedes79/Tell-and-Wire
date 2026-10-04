import { describe, it, expect } from 'vitest';
import { definitionExample, definitionKeys, misfits, textOutput } from './definition.ts';

const INPUT = `/**
 * @typedef {Object} Input
 * @property {string} csv  a CSV's text: a header row, then one row per country
 */
module.exports = { "csv": "Country,Population\\nIndia,1450" };
`;

describe('an input.js / output.js definition', () => {
  it('has the JSON after module.exports as its example, read as require() reads the file, its keys as ports, and holds a call\'s result to it', () => {
    expect(definitionExample(INPUT)).toEqual({ example: { csv: 'Country,Population\nIndia,1450' } });
    // A semicolon inside the example is the example's; one after it ends it; a comment after it is nothing.
    expect(definitionExample('module.exports = { "a": "x;y" };')).toEqual({ example: { a: 'x;y' } });
    expect(definitionExample('module.exports = { "a": 1 }; // a; b')).toEqual({ example: { a: 1 } });
    // A JSDoc or a string that mentions module.exports = is no assignment.
    expect(definitionExample('/**\n * One example, as module.exports = { … } says it.\n */\nmodule.exports = { "a": 2 };')).toEqual({ example: { a: 2 } });
    expect(definitionExample('const note = "module.exports = 1";\nmodule.exports = { "b": [1, { "c": "}" }] };')).toEqual({ example: { b: [1, { c: '}' }] } });
    expect('problem' in definitionExample("module.exports = { csv: 'a,b' };")).toBe(true);

    expect(definitionKeys(INPUT)).toEqual(['csv']);
    expect(definitionKeys('module.exports = { oops };')).toEqual([]);
    // One output that holds text is an answer in plain text; several, or one that is not text, are JSON.
    expect(textOutput('module.exports = { "summary": "Two sentences." };')).toBe('summary');
    expect(textOutput('module.exports = { "summary": "", "count": 2 };')).toBeUndefined();
    expect(textOutput('module.exports = { "count": 2 };')).toBeUndefined();

    // What one call returned is held to the shape of the output example, naming the place where it does not fit.
    const OUTPUT = 'module.exports = { "figure": { "kind": "bars", "points": [{ "label": "India", "value": 1450 }] } };';
    expect(misfits({ figure: { kind: 'line', points: [] } }, OUTPUT)).toEqual([]);
    expect(misfits({}, OUTPUT)).toEqual(['output "figure" is missing']);
    expect(misfits({ figure: { kind: 'bars', points: [{ label: 'India', value: 'many' }] } }, OUTPUT))
      .toEqual(['output "figure" at points[0].value is text; output.js says a number']);
    expect(misfits({ figure: 3 }, OUTPUT)).toEqual(['output "figure" is a number; output.js says an object']);
    // Nothing is fitted to a definition that cannot be read, and nothing is held to none.
    expect(misfits({ figure: {} }, 'module.exports = { "figure": {}, };')[0]).toMatch(/^output\.js cannot be read/);
    expect(misfits({}, '')).toEqual([]);
  });
});
