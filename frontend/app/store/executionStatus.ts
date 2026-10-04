import type { ExecutionStatus, NodeResult } from '../graph';
import { DANGER_FILL, DANGER_TEXT, SUCCESS_FILL, SUCCESS_TEXT, WARNING_FILL, WARNING_TEXT } from '../ui/theme';

/**
 * Whether a node result carries usable output.
 *
 * `partial` means a per-item batch had some items fail and the rest succeed: the
 * outputs are real, with `null` at the failed positions so the batch stays
 * index-aligned with its input. Everywhere that used to ask `status ===
 * 'success'` before reading `outputs` has to accept it too, or one bad item in a
 * thousand hides the other 999 from the panel, the canvas and memory
 * persistence alike.
 */
const delivered = (status: ExecutionStatus | string | undefined): boolean =>
  status === 'success' || status === 'partial';

/**
 * Whether a node's result has outputs to show: it made them this round, or it
 * stood still and what it made in an earlier one stands (`held`, which the
 * executor reports as `skipped` with those outputs). The canvas draws the
 * second faded; asked by status alone, it drew neither.
 */
export const hasOutputs = (result: Pick<NodeResult, 'status' | 'held'>): boolean =>
  delivered(result.status) || result.held === true;

/**
 * Chip/label colours for a status, shared by the results panel and the canvas:
 * green delivered, amber delivered with items lost (`partial`), red otherwise.
 */
export const statusTone = (status: ExecutionStatus | string | undefined) => {
  if (status === 'success') return { bg: SUCCESS_FILL, fg: SUCCESS_TEXT };
  if (status === 'partial') return { bg: WARNING_FILL, fg: WARNING_TEXT };
  return { bg: DANGER_FILL, fg: DANGER_TEXT };
};
