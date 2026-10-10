// Reading a page: fetch it (politely, and only the public web), take out what
// is worth reading, hand it over in pieces.

import { extract, type Extracted } from './extract.ts';
import { piece } from './paging.ts';
import { RobotsGuard } from './robots.ts';
import { FetchError, decode, get, type Policy } from './safeFetch.ts';

export interface PageResult {
  url: string;
  final_url: string;
  title: string;
  author: string;
  published: string;
  site: string;
  language: string;
  word_count: number;
  total_chars: number;
  start: number;
  end: number;
  /** Where to start the next call to read on; null: this was the end. */
  next_start: number | null;
  content: string;
  warning: string;
}

interface Read extends Extracted { finalUrl: string; warning: string }

const READABLE = new Set(['text/html', 'application/xhtml+xml', 'text/plain', 'text/markdown']);
const KEEP_MS = 5 * 60 * 1000;
const KEEP_PAGES = 8;

/** Why a status that is no success is no success, in a way that says what to do about it. */
function refused(status: number, statusText: string): FetchError {
  const why = status === 401 || status === 403 ? 'the site refuses this request; this tool does not log in or get around blocks'
    : status === 404 || status === 410 ? 'there is no such page'
      : status === 429 ? 'the site asks for fewer requests; try again later'
        : statusText;
  return new FetchError('http', `HTTP ${status}${why ? `: ${why}` : ''}`);
}

/** A title for a text that has none of its own: its first Markdown heading, else the file's name. */
function titleOfText(text: string, url: URL): string {
  const heading = /^#{1,3}\s+(.+?)\s*#*\s*$/m.exec(text)?.[1];
  if (heading) return heading;
  const last = url.pathname.split('/').filter(Boolean).pop() ?? '';
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

export class PageReader {
  private pages = new Map<string, { at: number; read: Read }>();
  private policy: Policy;
  private robots: RobotsGuard | null;
  private now: () => number;

  /** *robots* null: robots.txt is not asked (the machine's owner said so). */
  constructor(policy: Policy, robots: RobotsGuard | null, now: () => number = Date.now) {
    this.policy = policy;
    this.robots = robots;
    this.now = now;
  }

  async read(url: string, maxChars: number, start: number): Promise<PageResult> {
    const kept = this.pages.get(url);
    let read = kept && this.now() - kept.at < KEEP_MS ? kept.read : undefined;
    if (!read) {
      read = await this.load(url);
      this.pages.delete(url);
      this.pages.set(url, { at: this.now(), read });
      while (this.pages.size > KEEP_PAGES) this.pages.delete(this.pages.keys().next().value as string);
    }
    const part = piece(read.markdown, start, maxChars);
    return {
      url,
      final_url: read.finalUrl,
      title: read.title,
      author: read.author,
      published: read.published,
      site: read.site,
      language: read.language,
      word_count: read.wordCount,
      total_chars: read.markdown.length,
      start: part.start,
      end: part.end,
      next_start: part.next,
      content: part.text,
      warning: read.warning,
    };
  }

  private async load(url: string): Promise<Read> {
    const robots = this.robots;
    const fetched = await get(url, this.policy, {
      beforeRequest: robots ? (target) => robots.check(target, this.policy) : undefined,
    });
    if (fetched.status < 200 || fetched.status >= 300) throw refused(fetched.status, fetched.statusText);
    const type = fetched.contentType.split(';')[0].trim().toLowerCase();
    const pdf = type === 'application/pdf' || String.fromCharCode(...fetched.body.subarray(0, 5)) === '%PDF-';
    if (pdf) throw new FetchError('type', 'this is a PDF; read_page reads web pages and cannot read PDFs');
    if (type && !READABLE.has(type)) throw new FetchError('type', `this is ${type}, not a web page or text`);

    const text = decode(fetched.body, fetched.contentType);
    const finalUrl = fetched.url.href;
    const page: Extracted = type === 'text/plain' || type === 'text/markdown'
      ? { title: titleOfText(text, fetched.url), author: '', published: '', site: '', language: '', wordCount: text.split(/\s+/).filter(Boolean).length, markdown: text.trim() }
      : await extract(text, finalUrl);
    if (!page.markdown) {
      throw new FetchError('empty', 'nothing readable was found; the page probably builds its text with JavaScript, which this tool does not run, or needs a login');
    }
    const little = page.markdown.length < 200 && text.length > 5000;
    return {
      ...page,
      title: page.title || fetched.url.hostname,
      finalUrl,
      warning: little ? 'Very little text was found; the page may build its content with JavaScript, which this tool does not run.' : '',
    };
  }
}
