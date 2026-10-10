// robots.txt, read as RFC 9309 says: the group that names this tool, else the
// group for everyone; the longest matching rule wins, Allow on a tie; nothing
// matching means allowed.
//
// Not there (any 4xx): allowed. Not answering (5xx, or no answer): not allowed,
// as the RFC says -- a site that cannot say what it wants is not asked.

import { PRODUCT } from './info.ts';
import { FetchError, decode, get, type Policy } from './safeFetch.ts';

interface Rule { allow: boolean; pattern: RegExp; length: number }

/** A robots.txt path pattern -- `*` for anything, `$` for the end -- as a prefix match. */
function compile(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

export interface Rules { allows(pathAndQuery: string): boolean }

export const ALLOW_ALL: Rules = { allows: () => true };
export const ALLOW_NONE: Rules = { allows: () => false };

/** What *text* (a robots.txt) says to a crawler that calls itself *token*. */
export function parseRobots(text: string, token: string = PRODUCT): Rules {
  const me = token.toLowerCase();
  const groups: { agents: string[]; rules: Rule[] }[] = [];
  let open = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const match = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const field = match[1].toLowerCase();
    const value = match[2].trim();
    if (field === 'user-agent') {
      if (!open) groups.push({ agents: [], rules: [] });
      groups[groups.length - 1].agents.push(value.toLowerCase());
      open = true;
    } else if (field === 'allow' || field === 'disallow') {
      open = false;
      if (!groups.length || !value) continue;
      groups[groups.length - 1].rules.push({ allow: field === 'allow', pattern: compile(value), length: value.length });
    } else {
      open = false;
    }
  }
  // The longest agent name that starts this tool's name; none: the group for everyone.
  let best = 0;
  for (const group of groups) {
    for (const agent of group.agents) if (agent !== '*' && me.startsWith(agent)) best = Math.max(best, agent.length);
  }
  const chosen = groups.filter((group) => best
    ? group.agents.some((agent) => agent !== '*' && me.startsWith(agent) && agent.length === best)
    : group.agents.includes('*'));
  const rules = chosen.flatMap((group) => group.rules);
  return {
    allows(pathAndQuery) {
      let winner: Rule | undefined;
      for (const rule of rules) {
        if (!rule.pattern.test(pathAndQuery)) continue;
        if (!winner || rule.length > winner.length || (rule.length === winner.length && rule.allow)) winner = rule;
      }
      return winner ? winner.allow : true;
    },
  };
}

const KEEP_MS = 60 * 60 * 1000;
const KEEP_FAILURE_MS = 5 * 60 * 1000;

/** What each site's robots.txt says, asked for once an hour. */
export class RobotsGuard {
  private seen = new Map<string, { until: number; rules: Rules; why: string }>();
  private now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /** Throws a FetchError('robots') if *url* may not be read. */
  async check(url: URL, policy: Policy): Promise<void> {
    const known = this.seen.get(url.origin);
    const entry = known && known.until > this.now() ? known : await this.ask(url, policy);
    if (!entry.rules.allows(url.pathname + url.search)) {
      throw new FetchError('robots', `${url.origin}/robots.txt does not allow ${PRODUCT} to read ${url.pathname}${entry.why}`);
    }
  }

  private async ask(url: URL, policy: Policy): Promise<{ until: number; rules: Rules; why: string }> {
    const remember = (rules: Rules, ms: number, why = '') => {
      const entry = { until: this.now() + ms, rules, why };
      this.seen.set(url.origin, entry);
      return entry;
    };
    try {
      const answer = await get(`${url.origin}/robots.txt`, policy, {
        accept: 'text/plain,*/*;q=0.1', maxBytes: 512 * 1024, timeoutMs: Math.min(policy.timeoutMs, 10_000),
      });
      if (answer.status >= 200 && answer.status < 300) {
        return remember(parseRobots(decode(answer.body, answer.contentType)), KEEP_MS);
      }
      if (answer.status >= 400 && answer.status < 500) return remember(ALLOW_ALL, KEEP_MS);
      return remember(ALLOW_NONE, KEEP_FAILURE_MS, ` (its robots.txt answered HTTP ${answer.status}, so nothing is read)`);
    } catch (error) {
      if (error instanceof FetchError && (error.code === 'blocked' || error.code === 'url')) throw error;
      return remember(ALLOW_NONE, KEEP_FAILURE_MS, ' (its robots.txt could not be fetched, so nothing is read)');
    }
  }
}
