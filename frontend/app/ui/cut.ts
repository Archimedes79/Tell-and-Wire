/** *text*, or its first *max* characters and an ellipsis: a value said in a line, cut short. */
export function cut(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
