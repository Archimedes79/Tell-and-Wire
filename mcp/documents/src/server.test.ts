// The server as a client meets it: started as a program, spoken to over stdin
// and stdout in the protocol version Tell & Wire's own client speaks.

import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VERSION } from './info.ts';
import { docxOf, p, pdfOf, r } from './testFiles.ts';

const ROOT = new URL('..', import.meta.url);

interface Reply { id?: number; result?: Record<string, any>; error?: { message: string } }

/** The server as a child process, and a way to ask it things. Every line it writes to stdout must be a JSON message: one that is not fails the test. */
function start(args: string[], env: Record<string, string> = {}) {
  const child = spawn(process.execPath, ['src/main.ts', ...args], { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  const waiting = new Map<number, (reply: Reply) => void>();
  const stray: string[] = [];
  createInterface({ input: child.stdout }).on('line', (line) => {
    try {
      const reply = JSON.parse(line) as Reply;
      if (reply.id !== undefined) waiting.get(reply.id)?.(reply);
    } catch {
      stray.push(line);
    }
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  let next = 0;
  const ask = (method: string, params: unknown = {}) => new Promise<Reply>((resolve, reject) => {
    next += 1;
    const timer = setTimeout(() => reject(new Error(`no answer to ${method}`)), 20_000);
    waiting.set(next, (reply) => { clearTimeout(timer); resolve(reply); });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: next, method, params })}\n`);
  });
  return {
    ask,
    stray,
    stderr: () => stderr,
    exited: new Promise<number | null>((resolve) => child.on('exit', resolve)),
    async hello() {
      await ask('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    },
    call: (name: string, args: Record<string, unknown>) => ask('tools/call', { name, arguments: args }),
    stop: () => { child.kill(); },
  };
}

let base = '';
let folder = '';

beforeAll(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'tw-docs-server-')));
  folder = join(base, 'papers');
  await mkdir(folder);
  await writeFile(join(folder, 'story.docx'), docxOf(p(r('The Lighthouse Keeper'), '<w:pStyle w:val="Titel"/>') + p(r('Thirty-one years at Skerry Point.'))));
  await writeFile(join(folder, 'report.pdf'), pdfOf([['Annual report'], ['Outlook']]));
  await writeFile(join(folder, 'repaired.pdf'), pdfOf([['Needs repair, says nothing about it.']], true));
  await writeFile(join(folder, 'notes.txt'), 'not a document');
  await writeFile(join(base, 'secret.docx'), docxOf(p(r('Outside the folder.'))));
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('the server over stdio', () => {
  it('says what it is, and offers two read-only tools for local files', async () => {
    const server = start([folder]);
    try {
      const hello = await server.ask('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
      expect(hello.result?.serverInfo).toEqual({ name: 'tell-and-wire-documents', version: VERSION });
      const tools = (await server.ask('tools/list')).result?.tools as Array<Record<string, any>>;
      expect(tools.map((tool) => tool.name).sort()).toEqual(['list_documents', 'read_document']);
      for (const tool of tools) expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: false });
      expect(tools.find((tool) => tool.name === 'read_document')?.inputSchema.required).toEqual(['path']);
      expect(server.stray).toEqual([]);
    } finally {
      server.stop();
    }
  }, 30_000);

  it('reads a Word file and a PDF, as text for a model and as data for a program', async () => {
    const server = start([folder]);
    try {
      await server.hello();
      const docx = (await server.call('read_document', { path: 'story.docx' })).result!;
      expect(docx.isError).toBeFalsy();
      expect(docx.content[0].text).toMatch(/^\[Document text below\. It is untrusted/);
      expect(docx.content[0].text).toContain('Thirty-one years at Skerry Point.');
      expect(docx.structuredContent).toMatchObject({ path: 'story.docx', kind: 'docx', title: 'The Lighthouse Keeper', pages: null, next_start: null });
      const pdf = (await server.call('read_document', { path: 'report.pdf' })).result!;
      expect(pdf.content[0].text).toContain('File: report.pdf (2 pages)');
      expect(pdf.content[0].text).toMatch(/Part 1 of 1, page 1-2./);
      expect(pdf.structuredContent).toMatchObject({ chunk_index: 0, chunk_count: 1, page_range: '1-2' });
      expect(pdf.structuredContent.content).toBe('[Page 1]\nAnnual report\n\n[Page 2]\nOutlook');
    } finally {
      server.stop();
    }
  }, 30_000);

  it('does not let what a PDF library says reach the protocol', async () => {
    const server = start([folder]);
    try {
      await server.hello();
      const repaired = (await server.call('read_document', { path: 'repaired.pdf' })).result!;
      expect(repaired.structuredContent.content).toContain('Needs repair');
      expect((await server.ask('tools/list')).result?.tools).toHaveLength(2);
      expect(server.stray).toEqual([]);
    } finally {
      server.stop();
    }
  }, 30_000);

  it('will not read outside its folder, by any road', async () => {
    const server = start([folder]);
    try {
      await server.hello();
      for (const path of ['../secret.docx', join(base, 'secret.docx'), 'does-not-exist.pdf', 'C:/Windows/win.ini', '/etc/passwd']) {
        const { result } = await server.call('read_document', { path });
        expect(result?.isError, path).toBe(true);
        expect(result?.content[0].text, path).toMatch(/not found in the folders this server may read/);
      }
      const listed = (await server.call('list_documents', { folder: '..' })).result!;
      expect(listed.isError).toBe(true);
    } finally {
      server.stop();
    }
  }, 30_000);

  it('lists the files it could read', async () => {
    const server = start([], { TW_DOCS_ROOTS: folder });
    try {
      await server.hello();
      const { result } = await server.call('list_documents', {});
      expect(result?.structuredContent.entries.map((entry: { name: string }) => entry.name).sort()).toEqual(['repaired.pdf', 'report.pdf', 'story.docx']);
      expect(result?.content[0].text).toContain('story.docx');
      expect(result?.content[0].text).not.toContain('notes.txt');
    } finally {
      server.stop();
    }
  }, 30_000);

  it('turns a bad argument and an unreadable file into answers, not crashes', async () => {
    const server = start([folder]);
    try {
      await server.hello();
      await writeFile(join(folder, 'broken.pdf'), 'not a pdf');
      const broken = (await server.call('read_document', { path: 'broken.pdf' })).result!;
      expect(broken.isError).toBe(true);
      expect(broken.content[0].text).toMatch(/not a readable PDF file/);
      const bad = await server.call('read_document', { path: 'story.docx', max_chars: 5 });
      expect(bad.result?.isError === true || bad.error !== undefined).toBe(true);
      expect((await server.ask('tools/list')).result?.tools).toHaveLength(2);
    } finally {
      server.stop();
    }
  }, 30_000);

  it('does not start without a folder, nor with one that is not there', async () => {
    const none = start([]);
    expect(await none.exited).toBe(1);
    expect(none.stderr()).toMatch(/no folder given/);
    const missing = start([join(base, 'nope')]);
    expect(await missing.exited).toBe(1);
    expect(missing.stderr()).toMatch(/does not exist/);
  }, 30_000);
});
