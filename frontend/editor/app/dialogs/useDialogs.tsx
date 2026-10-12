import { Fragment, useCallback, useRef, useState, type ReactElement } from 'react';
import Question, { type Asked } from './Question';

/**
 * Dialogs asked for from code and answered as a promise: "may this graph be
 * replaced?" is a question to `await`, not a state threaded through the
 * screen. `show` puts the dialog *make* draws on top of whatever is open and
 * resolves with what it hands to `done`; `ask` is a `Question`, answered
 * `null` when the person cancels. Draw `dialogs` once, at the end of the page.
 */
export function useDialogs() {
  const [shown, setShown] = useState<{ id: number; element: ReactElement }[]>([]);
  const count = useRef(0);

  const show = useCallback(<T,>(make: (done: (answer: T) => void) => ReactElement): Promise<T> => new Promise<T>((resolve) => {
    const id = (count.current += 1);
    const done = (answer: T) => {
      setShown((list) => list.filter((one) => one.id !== id));
      resolve(answer);
    };
    setShown((list) => [...list, { id, element: make(done) }]);
  }), []);

  const ask = useCallback(<T,>(question: Asked<T>): Promise<T | null> => show<T | null>((done) => <Question {...question} onAnswer={done} />), [show]);

  return { show, ask, dialogs: shown.map(({ id, element }) => <Fragment key={id}>{element}</Fragment>) };
}
