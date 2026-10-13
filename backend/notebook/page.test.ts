import { describe, it, expect } from 'vitest';
import { addWindow, removeWindow } from '../../gui/notebook/edit.ts';
import { addBlock, fromMarkdown, moveBlock, pageOf, patchBlock, removeBlock, setKind, startPage, toMarkdown } from '../../gui/notebook/page.ts';
import { parseWindows } from '../../gui/notebook/read.ts';

/**
 * The page is text and windows in a list, written and read like Markdown: what an editor of pages does to it is a
 * function from document to document, and the windows come and go with the blocks that stand for them.
 */

const kinds = (doc: ReturnType<typeof startPage>) => pageOf(doc).map((block) => block.kind);

describe('the page of a notebook', () => {
  it('starts with the tool\'s name and its first window, and has every window on it however it came', () => {
    const doc = startPage('Tool');
    expect(kinds(doc)).toEqual(['h1', 'window']);
    // A window made by the cell list, not by the page, is on the page at the end; one taken away leaves it.
    const more = addWindow(doc, 'Second');
    expect(kinds(more)).toEqual(['h1', 'window', 'window']);
    expect(kinds(removeWindow(more, more.windows[0].id))).toEqual(['h1', 'window']);
  });

  it('puts a block where it is asked for, a window with its first cell, and keeps the windows in the order of the page', () => {
    let doc = addBlock(startPage('Tool'), 'p', 1);
    doc = addBlock(doc, 'window', 1);
    expect(kinds(doc)).toEqual(['h1', 'window', 'p', 'window']);
    expect(doc.windows).toHaveLength(2);
    expect(pageOf(doc)[1].window).toBe(doc.windows[0].id);
    const second = pageOf(doc)[3].window;
    expect(doc.windows[1].id).toBe(second);
    doc = moveBlock(doc, pageOf(doc)[3].id, -1);
    expect(kinds(doc)).toEqual(['h1', 'window', 'window', 'p']);
    expect(doc.windows[1].id).toBe(second);
  });

  it('types into a block, makes it another kind of text, and takes it out -- but a window leaves with its window, not as a block', () => {
    let doc = addBlock(startPage('Tool'), 'p');
    const id = pageOf(doc)[2].id;
    doc = patchBlock(doc, id, { text: 'one\ntwo' });
    doc = setKind(doc, id, 'ul');
    expect(pageOf(doc)[2]).toMatchObject({ kind: 'ul', text: 'one\ntwo' });
    doc = setKind(doc, id, 'h2');
    expect(pageOf(doc)[2]).toMatchObject({ kind: 'h2', text: 'one two' });
    doc = setKind(doc, id, 'space');
    expect(pageOf(doc)[2]).toEqual({ id, kind: 'space' });
    expect(kinds(removeBlock(doc, id))).toEqual(['h1', 'window']);
    const window = pageOf(doc)[1];
    expect(removeBlock(doc, window.id)).toBe(doc);
    expect(setKind(doc, window.id, 'p')).toEqual(doc);
  });

  it('is read and written as Markdown, round trip, with a window named where it stands', () => {
    const doc = startPage('Tool');
    const id = doc.windows[0].id;
    const written = [
      '# Population', '', 'Pick a file, see the countries.', '', '## Chart', '', `[window: ${id}]`, '', '- first', '- second', '', '[space]', '', 'The end.', 'Two lines.',
    ].join('\n');
    const read = fromMarkdown(doc, written);
    expect(pageOf(read).map((block) => [block.kind, block.text ?? block.window ?? ''])).toEqual([
      ['h1', 'Population'], ['p', 'Pick a file, see the countries.'], ['h2', 'Chart'], ['window', id], ['ul', 'first\nsecond'], ['space', ''], ['p', 'The end.\nTwo lines.'],
    ]);
    expect(toMarkdown(read)).toBe(`${written}\n`);
    expect(fromMarkdown(read, toMarkdown(read)).page).toEqual(read.page);
    // A name the document does not have is left out; a window the text does not name stands at the end.
    expect(kinds(fromMarkdown(doc, '# Only\n\n[window: nowhere]'))).toEqual(['h1', 'window']);
  });

  it('has numbered lists and quotations: written as 1. and >, counted again on the way out, one block to each run of lines of a kind', () => {
    const doc = startPage('Tool');
    const read = fromMarkdown(doc, ['1. one', '2) two', '- apart', '> said', '> twice', '', 'then **bold** words'].join('\n'));
    expect(pageOf(read).filter((block) => block.kind !== 'window').map((block) => [block.kind, block.text])).toEqual([
      ['ol', 'one\ntwo'], ['ul', 'apart'], ['quote', 'said\ntwice'], ['p', 'then **bold** words'],
    ]);
    expect(toMarkdown(read)).toContain('1. one\n2. two\n\n- apart\n\n> said\n> twice\n\nthen **bold** words');
    // A block with no words in it comes back as it was written: an empty heading is not a paragraph of "#".
    const empty = fromMarkdown(doc, toMarkdown(addBlock(addBlock(doc, 'h1'), 'ul')));
    expect(pageOf(empty).filter((block) => block.kind !== 'window').map((block) => [block.kind, block.text])).toEqual([['h1', 'Tool'], ['h1', ''], ['ul', '']]);
    expect(setKind(read, pageOf(read)[0].id, 'ol')).toEqual(read);
    // The file keeps them, and a kind nobody knows is still left out.
    expect(parseWindows(JSON.parse(JSON.stringify(read))).page).toEqual(read.page);
    expect(pageOf({ ...read, page: [{ id: 'x', kind: 'olive' as never, text: 'no' }] }).map((block) => block.kind)).toEqual(['window']);
  });

  it('survives the file: the page and what a window asks are read back as they were written', () => {
    const doc = { ...addBlock(startPage('Tool'), 'ul'), windows: [{ ...startPage('Tool').windows[0], ask: 'Ask for a text.' }] };
    const back = parseWindows(JSON.parse(JSON.stringify(doc)));
    expect(back.page).toEqual(doc.page);
    expect(back.windows[0].ask).toBe('Ask for a text.');
    // Nobody wrote a page: there is none, and `pageOf` makes the plain one.
    expect(parseWindows({ windows: [] }).page).toBeUndefined();
  });
});

describe('the page in the tool that is delivered', () => {
  it('is carried in the gui: the words as blocks that say where they stand, the windows with the place of their heading', async () => {
    const { windowsToGraph } = await import('../../gui/notebook/windows.ts');
    const { writeProject } = await import('../authoring/write.ts');
    const { loadGraph } = await import('../deployment/project/folder.ts');
    const { mkdtemp } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');

    let doc = addBlock(startPage('Tool'), 'ul', 1);
    const list = pageOf(doc)[1];
    doc = patchBlock(doc, list.id, { text: 'one\ntwo' });
    const graph = windowsToGraph(doc);
    const blocks = graph.gui!.blocks as unknown as Record<string, unknown>[];
    expect(blocks.filter((block) => typeof block.group !== 'string').map((block) => [block.page_at, block.page_style, block.value])).toEqual([[0, 'h1', 'Tool'], [1, 'ul', 'one\ntwo']]);
    expect(blocks.find((block) => block.span !== undefined)?.page_at).toBe(2);

    // The keys come back from the project folder, so a package draws the page without the file the notebook keeps.
    const folder = await mkdtemp(join(tmpdir(), 'page-'));
    await writeProject(folder, graph);
    const back = (await loadGraph(folder)).gui!.blocks as unknown as Record<string, unknown>[];
    expect(back.filter((block) => block.page_style).map((block) => [block.page_at, block.page_style])).toEqual([[0, 'h1'], [1, 'ul']]);

    // A document with no page of its own has no words in its tool: the name above its windows is the tool's own.
    const plain = windowsToGraph({ ...doc, page: undefined });
    expect((plain.gui!.blocks as unknown as Record<string, unknown>[]).some((block) => block.page_style)).toBe(false);
  });
});
