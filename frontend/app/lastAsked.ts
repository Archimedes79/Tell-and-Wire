// What the bar under the canvas asks of a request that takes a while: whether it
// is still the one wanted.

/**
 * Numbered requests of which only the last is still wanted: `ask` hands out
 * what tells a request whether it still is, and `cancel` makes none of them.
 *
 * A request left running when it was stopped showed its answer later, as the
 * answer to the next thing asked.
 */
export function lastAsked(): { ask: () => () => boolean; cancel: () => void } {
  let last = 0;
  return {
    ask: () => {
      last += 1;
      const mine = last;
      return () => mine === last;
    },
    cancel: () => { last += 1; },
  };
}
