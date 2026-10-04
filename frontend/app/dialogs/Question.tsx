import Modal from '../ui/Modal';
import Button, { type ButtonVariant } from '../ui/Button';
import { TEXT } from '../ui/theme';

export interface Asked<T> {
  title: string;
  text: string;
  /** The answers besides Cancel, in the order of the footer: the one asked for last. */
  answers: { value: T; label: string; variant?: ButtonVariant }[];
}

/**
 * A question in a dialog: `[Cancel]` and an answer or two. Cancel, ✕ and
 * Escape answer `null`. Enter answers nothing: the dialog has no field, and
 * an answer is a click.
 */
export default function Question<T>({ title, text, answers, onAnswer }: Asked<T> & { onAnswer: (answer: T | null) => void }) {
  return (
    <Modal
      title={title}
      onClose={() => onAnswer(null)}
      footer={
        <>
          <Button onClick={() => onAnswer(null)}>Cancel</Button>
          {answers.map((answer) => (
            <Button key={answer.label} variant={answer.variant} onClick={() => onAnswer(answer.value)}>{answer.label}</Button>
          ))}
        </>
      }
    >
      <p className="p-5 text-sm" style={{ color: TEXT }}>{text}</p>
    </Modal>
  );
}
