import { useRef, useState } from 'react';
import { call, type Requirement } from '../../app/api/client';
import { roundRefused, startRound, useSession, type RoundAsk } from '../../app/api/session';

/**
 * Starting a round the way every page starts one.
 *
 * Three hosts draw a page in use -- `runtime/RuntimeApp.tsx` for a tool
 * someone was handed, the editor's running application, and the editor's Page
 * tab, whose blocks are live -- and ▶ Run starts the rounds of a graph without
 * a page the same way again. A round from any of them has the same two steps:
 * ask what the page still needs (a file nobody chose on a picker), and only
 * then start it, with what was set on the page and the answers, by name.
 *
 * *before*, given, runs first: the editor hands its document to the server,
 * so the round runs what is being edited. *values* is what the page sends
 * besides what was set on it -- the Page tab's design.
 */
export function useRound(before?: () => Promise<void>, values?: () => Record<string, unknown>) {
  const [requirements, setRequirements] = useState<Requirement[] | null>(null);
  const pending = useRef<{ event: string | null; ask: RoundAsk } | null>(null);

  /**
   * Start a round at start point *event* -- the whole graph for none -- once
   * whatever it still needs is answered. *by*, a block of the page that fired
   * it: the round is sent what the page holds. Without one it is a call, sent
   * *sent* -- nothing, for a round of everything, which reads what the
   * session keeps.
   */
  const run = async (event: string | null = null, by?: string, sent?: Record<string, unknown>) => {
    try {
      await before?.();
    } catch (error) {
      // The document could not be handed over: said as a run that did not start, not thrown at the button.
      roundRefused(error, event, by);
      return;
    }
    const ask: RoundAsk = by ? { values: { ...values?.(), ...useSession.getState().edits }, by } : sent ? { values: sent } : {};
    try {
      // The "before running" questions, for this event: what it does not run is not asked about.
      const needed = await call('requirements', { event, ...ask });
      if (needed.length > 0) {
        pending.current = { event, ask };
        setRequirements(needed);
        return;
      }
    } catch {
      // Requirements are an optimisation; if the check fails, just run and let
      // the backend report a missing value properly.
    }
    await startRound(event, ask);
  };

  /** The answers, under the keys they were asked with: kept by the session with the round, so the next one does not ask again. */
  const submit = async (answers: Record<string, string>) => {
    const asked = pending.current;
    pending.current = null;
    setRequirements(null);
    if (asked) await startRound(asked.event, { ...asked.ask, answers });
  };

  const cancel = () => {
    pending.current = null;
    setRequirements(null);
  };

  return { run, requirements, submit, cancel };
}
